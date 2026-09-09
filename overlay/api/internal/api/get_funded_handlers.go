package api

import (
	"database/sql"
	"net/http"
	"net/url"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/store"
)

const (
	getFundedMaxFirmName    = 120
	getFundedMaxHeading     = 180
	getFundedMaxDescription = 500
	getFundedMaxContent     = 24000
	getFundedMaxURL         = 800
	getFundedMaxCTALabel    = 80
	getFundedMaxPromoCode   = 80
)

func (s *Server) getFundedRoutes(g *echo.Group) {
	g.GET("/get-funded", s.handleListPublishedGetFundedListings)
	admin := g.Group("/admin/get-funded", s.requireAdmin)
	admin.GET("", s.handleListAllGetFundedListings)
	admin.POST("", s.handleCreateGetFundedListing)
	admin.PATCH("/:id", s.handleUpdateGetFundedListing)
	admin.DELETE("/:id", s.handleDeleteGetFundedListing)
}

type getFundedListingDTO struct {
	ID           string    `json:"id"`
	FirmName     string    `json:"firm_name"`
	Heading      string    `json:"heading"`
	Description  string    `json:"description"`
	Content      string    `json:"content"`
	ImageURL     string    `json:"image_url"`
	AffiliateURL string    `json:"affiliate_url"`
	CTALabel     string    `json:"cta_label"`
	PromoCode    string    `json:"promo_code"`
	DisplayOrder int64     `json:"display_order"`
	Published    bool      `json:"published"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type getFundedListingBody struct {
	FirmName     string `json:"firm_name"`
	Heading      string `json:"heading"`
	Description  string `json:"description"`
	Content      string `json:"content"`
	ImageURL     string `json:"image_url"`
	AffiliateURL string `json:"affiliate_url"`
	CTALabel     string `json:"cta_label"`
	PromoCode    string `json:"promo_code"`
	DisplayOrder int64  `json:"display_order"`
	Published    bool   `json:"published"`
}

func toGetFundedListingDTO(row store.GetFundedListing) getFundedListingDTO {
	return getFundedListingDTO{
		ID:           row.ID,
		FirmName:     row.FirmName,
		Heading:      row.Heading,
		Description:  row.Description,
		Content:      row.Content,
		ImageURL:     row.ImageUrl,
		AffiliateURL: row.AffiliateUrl,
		CTALabel:     row.CtaLabel,
		PromoCode:    row.PromoCode,
		DisplayOrder: row.DisplayOrder,
		Published:    row.Published == 1,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}

func cleanGetFundedText(v string, maxLen int) string {
	v = strings.TrimSpace(v)
	if len(v) <= maxLen {
		return v
	}
	return strings.TrimSpace(v[:maxLen])
}

func cleanGetFundedURL(v string) (string, bool) {
	v = cleanGetFundedText(v, getFundedMaxURL)
	if v == "" {
		return "", true
	}
	u, err := url.Parse(v)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", false
	}
	return u.String(), true
}

func getFundedPublishedFlag(v bool) int64 {
	if v {
		return 1
	}
	return 0
}

func cleanGetFundedBody(in getFundedListingBody) (getFundedListingBody, error) {
	out := getFundedListingBody{
		FirmName:     cleanGetFundedText(in.FirmName, getFundedMaxFirmName),
		Heading:      cleanGetFundedText(in.Heading, getFundedMaxHeading),
		Description:  cleanGetFundedText(in.Description, getFundedMaxDescription),
		Content:      cleanGetFundedText(in.Content, getFundedMaxContent),
		CTALabel:     cleanGetFundedText(in.CTALabel, getFundedMaxCTALabel),
		PromoCode:    cleanGetFundedText(in.PromoCode, getFundedMaxPromoCode),
		DisplayOrder: in.DisplayOrder,
		Published:    in.Published,
	}
	if out.FirmName == "" || out.Heading == "" {
		return out, Fail(http.StatusBadRequest, "bad_request", "firm name and heading are required", nil)
	}
	if out.CTALabel == "" {
		out.CTALabel = "Learn more"
	}
	var ok bool
	if out.ImageURL, ok = cleanGetFundedURL(in.ImageURL); !ok {
		return out, Fail(http.StatusBadRequest, "bad_request", "image URL must be http or https", nil)
	}
	if out.AffiliateURL, ok = cleanGetFundedURL(in.AffiliateURL); !ok {
		return out, Fail(http.StatusBadRequest, "bad_request", "affiliate URL must be http or https", nil)
	}
	return out, nil
}

func (s *Server) handleListPublishedGetFundedListings(c *echo.Context) error {
	rows, err := s.deps.Store.ListPublishedGetFundedListings(c.Request().Context())
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list get funded listings", nil)
	}
	out := make([]getFundedListingDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toGetFundedListingDTO(row))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleListAllGetFundedListings(c *echo.Context) error {
	rows, err := s.deps.Store.ListAllGetFundedListings(c.Request().Context())
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list get funded listings", nil)
	}
	out := make([]getFundedListingDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toGetFundedListingDTO(row))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleCreateGetFundedListing(c *echo.Context) error {
	var in getFundedListingBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanGetFundedBody(in)
	if err != nil {
		return err
	}
	row, err := s.deps.Store.CreateGetFundedListing(c.Request().Context(), store.CreateGetFundedListingParams{
		ID:           uuid.New().String(),
		FirmName:     body.FirmName,
		Heading:      body.Heading,
		Description:  body.Description,
		Content:      body.Content,
		ImageUrl:     body.ImageURL,
		AffiliateUrl: body.AffiliateURL,
		CtaLabel:     body.CTALabel,
		PromoCode:    body.PromoCode,
		DisplayOrder: body.DisplayOrder,
		Published:    getFundedPublishedFlag(body.Published),
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not create get funded listing", nil)
	}
	return c.JSON(http.StatusCreated, toGetFundedListingDTO(row))
}

func (s *Server) handleUpdateGetFundedListing(c *echo.Context) error {
	var in getFundedListingBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanGetFundedBody(in)
	if err != nil {
		return err
	}
	row, err := s.deps.Store.UpdateGetFundedListing(c.Request().Context(), store.UpdateGetFundedListingParams{
		ID:           c.Param("id"),
		FirmName:     body.FirmName,
		Heading:      body.Heading,
		Description:  body.Description,
		Content:      body.Content,
		ImageUrl:     body.ImageURL,
		AffiliateUrl: body.AffiliateURL,
		CtaLabel:     body.CTALabel,
		PromoCode:    body.PromoCode,
		DisplayOrder: body.DisplayOrder,
		Published:    getFundedPublishedFlag(body.Published),
	})
	if err == sql.ErrNoRows {
		return Fail(http.StatusNotFound, "not_found", "listing not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not update get funded listing", nil)
	}
	return c.JSON(http.StatusOK, toGetFundedListingDTO(row))
}

func (s *Server) handleDeleteGetFundedListing(c *echo.Context) error {
	n, err := s.deps.Store.DeleteGetFundedListing(c.Request().Context(), c.Param("id"))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete get funded listing", nil)
	}
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "listing not found", nil)
	}
	return c.NoContent(http.StatusNoContent)
}
