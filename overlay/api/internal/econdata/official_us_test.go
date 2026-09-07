package econdata

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseBEASchedule(t *testing.T) {
	body := []byte(`
		<table id="release-schedule-table">
			<thead><tr><th>Year 2026</th></tr></thead>
			<tbody>
				<tr>
					<td class="scheduled-date"><div class="release-date">September 30</div><small>8:30 AM</small></td>
					<td class="release-title">GDP (Third Estimate), 2nd Quarter 2026</td>
				</tr>
				<tr>
					<td class="scheduled-date"><div class="release-date">October 6</div><small>10:00 AM</small></td>
					<td class="release-title">U.S. International Trade in Goods and Services, August 2026</td>
				</tr>
			</tbody>
		</table>
	`)

	events, err := parseBEASchedule(body, 2025)
	require.NoError(t, err)
	require.Len(t, events, 2)
	require.Equal(t, "GDP (Third Estimate), 2nd Quarter 2026", events[0].Title)
	require.Equal(t, "USD", events[0].Country)
	require.Equal(t, "high", events[0].Impact)
	require.Equal(t, "2026-09-30T12:30:00Z", events[0].Time.Format("2006-01-02T15:04:05Z"))
	require.Equal(t, "2026-10-06T14:00:00Z", events[1].Time.Format("2006-01-02T15:04:05Z"))
}

func TestParseBLSRSS(t *testing.T) {
	body := []byte(`<?xml version="1.0"?>
		<rss><channel>
			<item>
				<title>Consumer Price Index - August 2026</title>
				<link>https://www.bls.gov/news.release/cpi.htm</link>
				<description>Consumer Price Index scheduled for September 11, 2026 at 8:30 AM</description>
			</item>
			<item>
				<title>Employment Situation - August 2026</title>
				<description>September 4, 2026 8:30 AM</description>
			</item>
		</channel></rss>`)

	events, err := parseBLSRSS(body, 2026)
	require.NoError(t, err)
	require.Len(t, events, 2)
	require.Equal(t, "Consumer Price Index - August 2026", events[0].Title)
	require.Equal(t, "high", events[0].Impact)
	require.Equal(t, "2026-09-11T12:30:00Z", events[0].Time.Format("2006-01-02T15:04:05Z"))
	require.Equal(t, "2026-09-04T12:30:00Z", events[1].Time.Format("2006-01-02T15:04:05Z"))
}

func TestNewProviderDefaultsToOfficialUS(t *testing.T) {
	require.Equal(t, "official-us", NewProvider("", "").Name())
	require.Equal(t, "official-us", NewProvider("unknown", "").Name())
	require.Equal(t, "forexfactory", NewProvider("forexfactory", "").Name())
}
