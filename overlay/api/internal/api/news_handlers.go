package api

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
)

const (
	newsProviderName = "GDELT Project + RSS fallbacks"
	newsProviderURL  = "https://www.gdeltproject.org/"
	newsAPITimeout   = 8 * time.Second
	newsCacheTTL     = 10 * time.Minute
)

type newsChannel string

const (
	newsChannelForex  newsChannel = "forex"
	newsChannelCrypto newsChannel = "crypto"
	newsChannelMetals newsChannel = "metals"
)

type newsItemDTO struct {
	Title       string `json:"title"`
	Excerpt     string `json:"excerpt"`
	Source      string `json:"source"`
	URL         string `json:"url"`
	PublishedAt string `json:"published_at"`
	Channel     string `json:"channel"`
}

type newsResponseDTO struct {
	Channel     string        `json:"channel"`
	Provider    string        `json:"provider"`
	ProviderURL string        `json:"provider_url"`
	UpdatedAt   string        `json:"updated_at"`
	Items       []newsItemDTO `json:"items"`
}

type gdeltArticle struct {
	URL          string `json:"url"`
	Title        string `json:"title"`
	SeenDate     string `json:"seendate"`
	Domain       string `json:"domain"`
	SourceCommon string `json:"sourceCommonName"`
}

type gdeltDocResponse struct {
	Articles []gdeltArticle `json:"articles"`
}

type rssFeed struct {
	Channel struct {
		Title string    `xml:"title"`
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
	Source      string `xml:"source"`
}

type rssSource struct {
	Name string
	URL  string
}

type cachedNews struct {
	response newsResponseDTO
	expires  time.Time
}

var newsCache = struct {
	sync.Mutex
	byChannel map[newsChannel]cachedNews
}{byChannel: make(map[newsChannel]cachedNews)}

var newsQueries = map[newsChannel]string{
	newsChannelForex:  `(forex OR "foreign exchange" OR currency OR "central bank" OR dollar OR euro OR yen OR pound)`,
	newsChannelCrypto: `(crypto OR bitcoin OR ethereum OR blockchain OR stablecoin OR cryptocurrency)`,
	newsChannelMetals: `("gold price" OR "silver price" OR "precious metals" OR "gold futures" OR XAU OR XAG)`,
}

var newsRSSSources = map[newsChannel][]rssSource{
	newsChannelForex: {
		{Name: "ForexLive", URL: "https://www.forexlive.com/feed/"},
	},
	newsChannelCrypto: {
		{Name: "CoinDesk", URL: "https://www.coindesk.com/arc/outboundfeeds/rss/"},
		{Name: "Cointelegraph", URL: "https://cointelegraph.com/rss"},
	},
	newsChannelMetals: {
		{Name: "Investing.com Commodities", URL: "https://www.investing.com/rss/news_301.rss"},
	},
}

func (s *Server) handleListNews(c *echo.Context) error {
	channel, ok := parseNewsChannel(c.QueryParam("channel"))
	if !ok {
		return Fail(http.StatusBadRequest, "bad_request", "channel must be forex, crypto, or metals", nil)
	}

	now := time.Now().UTC()
	newsCache.Lock()
	if cached, found := newsCache.byChannel[channel]; found && cached.expires.After(now) {
		newsCache.Unlock()
		return c.JSON(http.StatusOK, cached.response)
	}
	newsCache.Unlock()

	response, err := fetchNews(c.Request().Context(), channel, now)
	if err != nil {
		c.Logger().Warn("news feed refresh failed", "err", err)
		response, err = fetchRSSNews(c.Request().Context(), channel, now)
		if err != nil {
			c.Logger().Warn("news rss fallback failed", "err", err)
			return Fail(http.StatusBadGateway, "news_unavailable", "could not load latest news", nil)
		}
	}

	newsCache.Lock()
	newsCache.byChannel[channel] = cachedNews{response: response, expires: now.Add(newsCacheTTL)}
	newsCache.Unlock()
	return c.JSON(http.StatusOK, response)
}

func fetchRSSNews(ctx context.Context, channel newsChannel, now time.Time) (newsResponseDTO, error) {
	sources := newsRSSSources[channel]
	if len(sources) == 0 {
		return newsResponseDTO{}, fmt.Errorf("no rss sources for %s", channel)
	}
	ctx, cancel := context.WithTimeout(ctx, newsAPITimeout*time.Duration(len(sources)))
	defer cancel()

	var items []newsItemDTO
	var errs []string
	for _, source := range sources {
		sourceItems, err := fetchRSSSource(ctx, channel, source)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", source.Name, err))
			continue
		}
		items = append(items, sourceItems...)
	}
	if len(items) == 0 {
		return newsResponseDTO{}, fmt.Errorf("rss sources empty: %s", strings.Join(errs, "; "))
	}
	items = dedupeAndLimitNews(items, 20)
	return newsResponseDTO{
		Channel:     string(channel),
		Provider:    "RSS feeds",
		ProviderURL: newsProviderURL,
		UpdatedAt:   now.Format(time.RFC3339),
		Items:       items,
	}, nil
}

func fetchRSSSource(ctx context.Context, channel newsChannel, source rssSource) ([]newsItemDTO, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TraderMemos/1.0 (+https://journal.ranksmedia.com)")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("rss returned %s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, err
	}
	items := make([]newsItemDTO, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		title := cleanNewsText(item.Title, 180)
		link := strings.TrimSpace(item.Link)
		if title == "" || link == "" || !safeHTTPURL(link) {
			continue
		}
		sourceName := cleanNewsText(item.Source, 80)
		if sourceName == "" {
			sourceName = source.Name
		}
		excerpt := cleanNewsText(stripHTML(item.Description), 220)
		if excerpt == "" {
			excerpt = title
		}
		items = append(items, newsItemDTO{
			Title:       title,
			Excerpt:     excerpt,
			Source:      sourceName,
			URL:         link,
			PublishedAt: parseRSSDate(item.PubDate),
			Channel:     string(channel),
		})
	}
	return items, nil
}

func parseNewsChannel(raw string) (newsChannel, bool) {
	switch newsChannel(strings.ToLower(strings.TrimSpace(raw))) {
	case "", newsChannelForex:
		return newsChannelForex, true
	case newsChannelCrypto:
		return newsChannelCrypto, true
	case newsChannelMetals:
		return newsChannelMetals, true
	default:
		return "", false
	}
}

func fetchNews(ctx context.Context, channel newsChannel, now time.Time) (newsResponseDTO, error) {
	ctx, cancel := context.WithTimeout(ctx, newsAPITimeout)
	defer cancel()

	endpoint, err := url.Parse("https://api.gdeltproject.org/api/v2/doc/doc")
	if err != nil {
		return newsResponseDTO{}, err
	}
	q := endpoint.Query()
	q.Set("query", newsQueries[channel])
	q.Set("mode", "artlist")
	q.Set("format", "json")
	q.Set("sort", "datedesc")
	q.Set("timespan", "1week")
	q.Set("maxrecords", "25")
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return newsResponseDTO{}, err
	}
	req.Header.Set("User-Agent", "TraderMemos/1.0 (+https://journal.ranksmedia.com)")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return newsResponseDTO{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return newsResponseDTO{}, fmt.Errorf("gdelt returned %s", res.Status)
	}

	var body gdeltDocResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return newsResponseDTO{}, err
	}
	items := gdeltArticlesToNews(channel, body.Articles)
	return newsResponseDTO{
		Channel:     string(channel),
		Provider:    newsProviderName,
		ProviderURL: newsProviderURL,
		UpdatedAt:   now.Format(time.RFC3339),
		Items:       items,
	}, nil
}

func gdeltArticlesToNews(channel newsChannel, articles []gdeltArticle) []newsItemDTO {
	seen := make(map[string]bool)
	items := make([]newsItemDTO, 0, min(len(articles), 20))
	for _, article := range articles {
		title := cleanNewsText(article.Title, 180)
		link := strings.TrimSpace(article.URL)
		if title == "" || link == "" || seen[link] || !safeHTTPURL(link) {
			continue
		}
		seen[link] = true
		source := cleanNewsText(article.SourceCommon, 80)
		if source == "" {
			source = cleanNewsText(article.Domain, 80)
		}
		items = append(items, newsItemDTO{
			Title:       title,
			Excerpt:     title,
			Source:      source,
			URL:         link,
			PublishedAt: parseGDELTSeenDate(article.SeenDate),
			Channel:     string(channel),
		})
	}
	return dedupeAndLimitNews(items, 20)
}

func cleanNewsText(raw string, maxRunes int) string {
	cleaned := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
	if cleaned == "" {
		return ""
	}
	runes := []rune(cleaned)
	if len(runes) <= maxRunes {
		return cleaned
	}
	return strings.TrimSpace(string(runes[:maxRunes-1])) + "…"
}

func safeHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Scheme == "https" || u.Scheme == "http"
}

func parseGDELTSeenDate(raw string) string {
	raw = strings.TrimSpace(raw)
	for _, layout := range []string{"20060102150405", "20060102T150405Z"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

func parseRSSDate(raw string) string {
	raw = strings.TrimSpace(raw)
	for _, layout := range []string{
		time.RFC1123Z,
		time.RFC1123,
		time.RFC822Z,
		time.RFC822,
		"Mon, 02 Jan 2006 15:04:05 MST",
		"Mon, 2 Jan 2006 15:04:05 MST",
	} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

var htmlTagPattern = regexp.MustCompile(`<[^>]*>`)

func stripHTML(raw string) string {
	noTags := htmlTagPattern.ReplaceAllString(raw, " ")
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&nbsp;", " ",
	)
	return replacer.Replace(noTags)
}

func dedupeAndLimitNews(items []newsItemDTO, limit int) []newsItemDTO {
	seen := make(map[string]bool)
	out := make([]newsItemDTO, 0, min(len(items), limit))
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].PublishedAt > items[j].PublishedAt
	})
	for _, item := range items {
		if item.URL == "" || seen[item.URL] {
			continue
		}
		seen[item.URL] = true
		out = append(out, item)
		if len(out) >= limit {
			break
		}
	}
	return out
}
