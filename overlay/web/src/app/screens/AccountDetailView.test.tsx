import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { Toaster } from "@/components/Toaster";
import type { Account } from "@/lib/api/types";
import { AccountDetailView } from "./AccountDetailView";

const account: Account = {
  id: "a1",
  user_id: "u1",
  name: "Main",
  broker: "Other broker",
  account_type: "cash",
  base_currency: "USD",
  starting_balance: 10000,
  created_at: "2026-01-01T00:00:00Z",
};

const updateAccount = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [account], isLoading: false }),
  useUpdateAccount: () => ({ mutate: updateAccount, isPending: false }),
  useDeleteAccount: () => ({ mutateAsync: vi.fn() }),
  useClearAccountTrades: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hooks/useTrades", () => ({
  useTrades: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/hooks/useCash", () => ({
  useCash: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/hooks/useFlexSync", () => ({
  useFlexSync: () => ({ data: undefined }),
  useRunFlexSync: () => ({ mutate: vi.fn(), isPending: false }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <Toaster>{children}</Toaster>
    </QueryClientProvider>
  );
}

describe("AccountDetailView", () => {
  it("saves the edited account base currency", async () => {
    const user = userEvent.setup();
    updateAccount.mockImplementation((_body, opts) => opts?.onSuccess?.());

    render(
      <Wrapper>
        <AccountDetailView accountId="a1" onBack={vi.fn()} onDeleted={vi.fn()} />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Base currency"), "ZAR");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(
        {
          id: "a1",
          body: expect.objectContaining({ name: "Main", broker: "Other broker", base_currency: "ZAR" }),
        },
        expect.any(Object),
      ),
    );
  });
});
