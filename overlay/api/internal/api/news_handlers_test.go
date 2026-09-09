package api

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseNewsChannel(t *testing.T) {
	require.Equal(t, newsChannelForex, mustNewsChannel(t, ""))
	require.Equal(t, newsChannelForex, mustNewsChannel(t, "FOREX"))
	require.Equal(t, newsChannelCrypto, mustNewsChannel(t, "crypto"))
	require.Equal(t, newsChannelMetals, mustNewsChannel(t, "metals"))
	_, ok := parseNewsChannel("stocks")
	require.False(t, ok)
}

func TestGDELTArticlesToNewsSanitizesAndLimits(t *testing.T) {
	articles := []gdeltArticle{
		{
			URL:          "javascript:alert(1)",
			Title:        "bad",
			SeenDate:     "20260909120000",
			SourceCommon: "Bad Source",
		},
		{
			URL:          "https://example.com/a",
			Title:        strings.Repeat("Gold ", 60),
			SeenDate:     "20260909115900",
			SourceCommon: " Example News ",
		},
		{
			URL:          "https://example.com/a",
			Title:        "Duplicate URL",
			SeenDate:     "20260909115800",
			SourceCommon: "Example News",
		},
	}

	items := gdeltArticlesToNews(newsChannelMetals, articles)
	require.Len(t, items, 1)
	require.Equal(t, "https://example.com/a", items[0].URL)
	require.Equal(t, "Example News", items[0].Source)
	require.Equal(t, "metals", items[0].Channel)
	require.Equal(t, "2026-09-09T11:59:00Z", items[0].PublishedAt)
	require.LessOrEqual(t, len([]rune(items[0].Title)), 180)
	require.Equal(t, items[0].Title, items[0].Excerpt)
}

func TestStripHTMLForRSSExcerpt(t *testing.T) {
	require.Equal(t, "Gold & silver rally", cleanNewsText(stripHTML("<p>Gold &amp; silver&nbsp;rally</p>"), 80))
}

func mustNewsChannel(t *testing.T, raw string) newsChannel {
	t.Helper()
	channel, ok := parseNewsChannel(raw)
	require.True(t, ok)
	return channel
}
