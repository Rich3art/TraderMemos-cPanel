import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GetFundedListing } from "@/lib/api/types";
import { GetFundedView } from "./GetFundedView";

const LISTING: GetFundedListing = {
  id: "listing-1",
  firm_name: "Alpha Prop",
  heading: "Trade funded capital",
  description: "Evaluation accounts for disciplined traders.",
  content: "",
  image_url: "",
  affiliate_url: "https://example.com/alpha",
  cta_label: "Apply now",
  promo_code: "TM10",
  display_order: 1,
  published: true,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

describe("GetFundedView", () => {
  it("renders published prop firm listings", () => {
    render(
      <GetFundedView
        listings={[LISTING]}
        adminListings={[]}
        isAdmin={false}
        loading={false}
        adminLoading={false}
        error={false}
        saving={false}
        onCreate={async () => undefined}
        onUpdate={async () => undefined}
        onDelete={async () => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Get Funded" })).toBeInTheDocument();
    expect(screen.getByText("Alpha Prop")).toBeInTheDocument();
    expect(screen.getByText("Trade funded capital")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apply now/i })).toHaveAttribute(
      "href",
      "https://example.com/alpha",
    );
  });

  it("allows admins to create and edit listings", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    const onUpdate = vi.fn(async () => undefined);

    render(
      <GetFundedView
        listings={[LISTING]}
        adminListings={[LISTING]}
        isAdmin
        loading={false}
        adminLoading={false}
        error={false}
        saving={false}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={async () => undefined}
      />,
    );

    await user.clear(screen.getByLabelText("Firm name"));
    await user.type(screen.getByLabelText("Firm name"), "Beta Funding");
    await user.type(screen.getAllByLabelText("Heading")[0], "Fast challenges");
    await user.click(screen.getByRole("button", { name: "Create listing" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ firm_name: "Beta Funding" }));

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Firm name")).toHaveValue("Alpha Prop");
    await user.clear(screen.getAllByLabelText("Heading")[0]);
    await user.type(screen.getAllByLabelText("Heading")[0], "Updated offer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "listing-1",
      expect.objectContaining({ heading: "Updated offer" }),
    );
  });
});
