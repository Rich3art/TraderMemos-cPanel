-- name: ListPublishedGetFundedListings :many
SELECT id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at
FROM get_funded_listings
WHERE published = 1
ORDER BY display_order ASC, created_at DESC;

-- name: ListAllGetFundedListings :many
SELECT id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at
FROM get_funded_listings
ORDER BY display_order ASC, created_at DESC;

-- name: CreateGetFundedListing :one
INSERT INTO get_funded_listings (
  id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
RETURNING id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at;

-- name: UpdateGetFundedListing :one
UPDATE get_funded_listings
SET firm_name = ?,
    heading = ?,
    description = ?,
    content = ?,
    image_url = ?,
    affiliate_url = ?,
    cta_label = ?,
    promo_code = ?,
    display_order = ?,
    published = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ?
RETURNING id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at;

-- name: DeleteGetFundedListing :execrows
DELETE FROM get_funded_listings
WHERE id = ?;
