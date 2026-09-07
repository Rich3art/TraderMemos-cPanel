package econdata

import (
	"context"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	DefaultBLSScheduleURL = "https://www.bls.gov/schedule/news_release/content/%d/%dnews_releases_public.rss"
	DefaultBEAScheduleURL = "https://www.bea.gov/news/schedule"
)

type OfficialUSProvider struct {
	Client *http.Client

	BLSURLTemplate string
	BEAURL         string
}

func NewOfficialUSProvider() *OfficialUSProvider {
	return &OfficialUSProvider{Client: &http.Client{Timeout: 20 * time.Second}}
}

func (p *OfficialUSProvider) Name() string { return "official-us" }

func (p *OfficialUSProvider) FetchEvents(ctx context.Context) ([]Event, error) {
	var events []Event
	var errs []string

	bls, err := p.fetchBLS(ctx)
	if err != nil {
		errs = append(errs, err.Error())
	} else {
		events = append(events, bls...)
	}

	bea, err := p.fetchBEA(ctx)
	if err != nil {
		errs = append(errs, err.Error())
	} else {
		events = append(events, bea...)
	}

	if len(events) == 0 && len(errs) > 0 {
		return nil, fmt.Errorf("official us calendar: %s", strings.Join(errs, "; "))
	}
	return events, nil
}

func (p *OfficialUSProvider) client() *http.Client {
	if p.Client != nil {
		return p.Client
	}
	return http.DefaultClient
}

func (p *OfficialUSProvider) get(ctx context.Context, url, accept string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TraderMemos/1.0 (+https://tradermemos.app)")
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	resp, err := p.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("%s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}

func (p *OfficialUSProvider) fetchBLS(ctx context.Context) ([]Event, error) {
	tmpl := p.BLSURLTemplate
	if tmpl == "" {
		tmpl = DefaultBLSScheduleURL
	}
	now := time.Now().UTC()
	years := []int{now.Year(), now.Year() + 1}
	var events []Event
	var errs []string
	for _, year := range years {
		body, err := p.get(ctx, fmt.Sprintf(tmpl, year, year), "application/rss+xml, application/xml, text/xml")
		if err != nil {
			errs = append(errs, fmt.Sprintf("bls %d: %v", year, err))
			continue
		}
		rows, err := parseBLSRSS(body, year)
		if err != nil {
			errs = append(errs, fmt.Sprintf("bls %d: %v", year, err))
			continue
		}
		events = append(events, rows...)
	}
	if len(events) == 0 && len(errs) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(errs, "; "))
	}
	return events, nil
}

func (p *OfficialUSProvider) fetchBEA(ctx context.Context) ([]Event, error) {
	url := p.BEAURL
	if url == "" {
		url = DefaultBEAScheduleURL
	}
	body, err := p.get(ctx, url, "text/html, application/xhtml+xml")
	if err != nil {
		return nil, fmt.Errorf("bea: %w", err)
	}
	return parseBEASchedule(body, time.Now().UTC().Year())
}

type rssFeed struct {
	Items []rssItem `xml:"channel>item"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	PubDate     string `xml:"pubDate"`
}

func parseBLSRSS(body []byte, fallbackYear int) ([]Event, error) {
	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, err
	}
	var events []Event
	for _, item := range feed.Items {
		title := cleanText(item.Title)
		if title == "" {
			continue
		}
		at, ok := parseOfficialDate(item.Description+" "+item.PubDate+" "+item.Title, fallbackYear)
		if !ok {
			continue
		}
		events = append(events, Event{
			Title:   title,
			Country: "USD",
			Impact:  impactForTitle(title),
			Time:    at,
		})
	}
	return events, nil
}

var beaRowRe = regexp.MustCompile(`(?is)<tr[^>]*>.*?<div[^>]*class="[^"]*\brelease-date\b[^"]*"[^>]*>(.*?)</div>\s*<small[^>]*>(.*?)</small>.*?<td[^>]*class="[^"]*\brelease-title\b[^"]*"[^>]*>(.*?)</td>.*?</tr>`)

func parseBEASchedule(body []byte, fallbackYear int) ([]Event, error) {
	year := fallbackYear
	if m := regexp.MustCompile(`Year\s+(\d{4})`).FindSubmatch(body); len(m) == 2 {
		if parsed, err := time.Parse("2006", string(m[1])); err == nil {
			year = parsed.Year()
		}
	}

	matches := beaRowRe.FindAllSubmatch(body, -1)
	events := make([]Event, 0, len(matches))
	for _, m := range matches {
		dateText := cleanText(string(m[1]))
		timeText := cleanText(string(m[2]))
		title := cleanText(string(m[3]))
		if title == "" || strings.Contains(strings.ToLower(dateText), "cancel") {
			continue
		}
		at, ok := parseOfficialDate(dateText+" "+timeText, year)
		if !ok {
			continue
		}
		events = append(events, Event{
			Title:   title,
			Country: "USD",
			Impact:  impactForTitle(title),
			Time:    at,
		})
	}
	return events, nil
}

var dateTimeRe = regexp.MustCompile(`(?i)\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?`)

func parseOfficialDate(raw string, fallbackYear int) (time.Time, bool) {
	m := dateTimeRe.FindStringSubmatch(cleanText(raw))
	if len(m) == 0 {
		return time.Time{}, false
	}
	year := fallbackYear
	if m[3] != "" {
		if parsed, err := time.Parse("2006", m[3]); err == nil {
			year = parsed.Year()
		}
	}
	hour, minute := 8, 30
	if m[4] != "" && m[5] != "" {
		fmt.Sscanf(m[4], "%d", &hour)
		fmt.Sscanf(m[5], "%d", &minute)
		if strings.EqualFold(m[6], "PM") && hour != 12 {
			hour += 12
		}
		if strings.EqualFold(m[6], "AM") && hour == 12 {
			hour = 0
		}
	}
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.FixedZone("ET", -5*3600)
	}
	parsed, err := time.ParseInLocation("January 2 2006 15:04", fmt.Sprintf("%s %s %d %02d:%02d", m[1], m[2], year, hour, minute), loc)
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}

func cleanText(raw string) string {
	text := html.UnescapeString(raw)
	text = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(text, " ")
	text = strings.Join(strings.Fields(text), " ")
	return strings.TrimSpace(text)
}

func impactForTitle(title string) string {
	t := strings.ToLower(title)
	switch {
	case strings.Contains(t, "employment situation"),
		strings.Contains(t, "consumer price index"),
		strings.Contains(t, "gdp"),
		strings.Contains(t, "gross domestic product"),
		strings.Contains(t, "personal income"),
		strings.Contains(t, "international trade"),
		strings.Contains(t, "producer price index"):
		return "high"
	case strings.Contains(t, "job openings"),
		strings.Contains(t, "import and export prices"),
		strings.Contains(t, "retail"),
		strings.Contains(t, "manufacturing"),
		strings.Contains(t, "corporate profits"):
		return "medium"
	default:
		return "low"
	}
}
