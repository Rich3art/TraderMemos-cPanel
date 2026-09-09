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
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
RETURNING id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at;

-- name: UpdateGetFundedListing :one
UPDATE get_funded_listings
SET firm_name = $1,
    heading = $2,
    description = $3,
    content = $4,
    image_url = $5,
    affiliate_url = $6,
    cta_label = $7,
    promo_code = $8,
    display_order = $9,
    published = $10,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $11
RETURNING id, firm_name, heading, description, content, image_url, affiliate_url, cta_label, promo_code, display_order, published, created_at, updated_at;

-- name: DeleteGetFundedListing :execrows
DELETE FROM get_funded_listings
WHERE id = $1;
