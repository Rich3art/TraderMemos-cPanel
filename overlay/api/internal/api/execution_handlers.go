package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/importer"
	"github.com/tradermemos/api/internal/store"
)

func (s *Server) executionRoutes(g *echo.Group) {
	g.POST("/executions", s.handleCreateExecution)
	g.GET("/executions", s.handleListExecutions)
	g.PATCH("/executions/:id", s.handleUpdateExecution)
	g.DELETE("/executions/:id", s.handleDeleteExecution)
}

type createExecutionReq struct {
	AccountID      string            `json:"account_id"`
	Symbol         string            `json:"symbol"`
	InstrumentType string            `json:"instrument_type"`
	Side           string            `json:"side"`
	Quantity       float64           `json:"quantity"`
	Price          float64           `json:"price"`
	Fees           float64           `json:"fees"`
	Commission     float64           `json:"commission"`
	ExecutedAt     time.Time         `json:"executed_at"`
	Multiplier     float64           `json:"multiplier"`
	Details        map[string]string `json:"details"`
}

type updateExecutionReq struct {
	Side       string    `json:"side"`
	Quantity   float64   `json:"quantity"`
	Price      float64   `json:"price"`
	Fees       float64   `json:"fees"`
	Commission *float64  `json:"commission"`
	ExecutedAt time.Time `json:"executed_at"`
}

func (s *Server) handleCreateExecution(c *echo.Context) error {
	uid := auth.UserID(c)
	var in createExecutionReq
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	if in.AccountID == "" || in.Symbol == "" || (in.Side != "buy" && in.Side != "sell") {
		return Fail(http.StatusBadRequest, "bad_request", "account_id, symbol, and side(buy|sell) required", nil)
	}
	if in.ExecutedAt.IsZero() {
		return Fail(http.StatusBadRequest, "bad_request", "executed_at is required", nil)
	}
	acc, err := s.deps.Store.GetAccount(c.Request().Context(), store.GetAccountParams{
		ID: in.AccountID, UserID: uid,
	})
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "account not found", nil)
	}
	accountCurrencyChanged := false
	if currency := executionAccountCurrency(in.Details); currency != "" && !strings.EqualFold(currency, acc.BaseCurrency) {
		if _, err := s.deps.Store.UpdateAccount(c.Request().Context(), store.UpdateAccountParams{
			Name: acc.Name, Broker: acc.Broker, AccountType: acc.AccountType,
			BaseCurrency: currency, StartingBalance: acc.StartingBalance,
			ID: acc.ID, UserID: uid,
		}); err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not update account currency", nil)
		}
		accountCurrencyChanged = true
	}
	if in.InstrumentType == "" {
		in.InstrumentType = "stock"
	}
	in.Multiplier = importer.ResolveMultiplier(
		c.Request().Context(), s.deps.Store, in.InstrumentType, in.Symbol, in.Multiplier,
	)
	// Options hash on underlying + contract, the same key the importer uses —
	// otherwise two strikes filled at one price/time/quantity collide into a
	// single row, and a hand-logged fill never dedups against the broker sync
	// of the same fill. See importer.OptionDedupSymbol.
	hash := importer.DedupHash(
		importer.OptionDedupSymbolFromDetails(in.Symbol, in.InstrumentType, in.Details),
		in.Side, in.Quantity, in.Price, in.ExecutedAt,
	)

	// Idempotent: same fill already logged → return existing trade link.
	if existing, err := s.deps.Store.GetExecutionByDedup(c.Request().Context(), store.GetExecutionByDedupParams{
		AccountID: in.AccountID, DedupHash: hash,
	}); err == nil {
		if existing.UserID != uid {
			return Fail(http.StatusNotFound, "not_found", "account not found", nil)
		}
		detailsUpdated := false
		if len(in.Details) > 0 {
			if details, ok := executionDetailsSQL(in.Details); ok {
				if n, err := s.deps.Store.UpdateExecutionDetails(c.Request().Context(), store.UpdateExecutionDetailsParams{
					Details: details, ID: existing.ID, UserID: uid,
				}); err != nil {
					return Fail(http.StatusInternalServerError, "internal", "could not update execution details", nil)
				} else if n > 0 {
					detailsUpdated = true
				}
			}
		}
		if accountCurrencyChanged || detailsUpdated {
			if err := s.deps.Trades.Regroup(c.Request().Context(), uid, in.AccountID); err != nil {
				return Fail(http.StatusInternalServerError, "internal", "could not regroup trades", nil)
			}
		}
		tradeID, gerr := s.deps.Store.GetTradeIDForExecution(c.Request().Context(), existing.ID)
		if gerr != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not resolve trade", nil)
		}
		return c.JSON(http.StatusOK, map[string]string{
			"execution_id": existing.ID,
			"trade_id":     tradeID,
			"deduped":      "true",
		})
	} else if !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not check execution", nil)
	}

	execID := uuid.New().String()
	details, _ := executionDetailsSQL(in.Details)
	_, err = s.deps.Store.InsertExecution(c.Request().Context(), store.InsertExecutionParams{
		ID: execID, UserID: uid, AccountID: in.AccountID,
		Symbol: in.Symbol, InstrumentType: in.InstrumentType, Side: in.Side,
		Quantity: in.Quantity, Price: in.Price, Fees: in.Fees, Commission: in.Commission,
		ExecutedAt: in.ExecutedAt, Multiplier: in.Multiplier, Details: details, DedupHash: hash,
	})
	if err != nil {
		c.Logger().Warn("insert execution failed", "err", err, "symbol", in.Symbol, "side", in.Side)
		if isUniqueConstraint(err) {
			return Fail(http.StatusConflict, "conflict", "duplicate fill already exists", nil)
		}
		return Fail(http.StatusInternalServerError, "internal", "could not insert execution", nil)
	}
	if err := s.deps.Trades.Regroup(c.Request().Context(), uid, in.AccountID); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not regroup trades", nil)
	}
	tradeID, err := s.deps.Store.GetTradeIDForExecution(c.Request().Context(), execID)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not resolve trade", nil)
	}
	return c.JSON(http.StatusCreated, map[string]string{
		"execution_id": execID,
		"trade_id":     tradeID,
	})
}

func executionDetailsSQL(details map[string]string) (sql.NullString, bool) {
	if len(details) == 0 {
		return sql.NullString{}, false
	}
	b, err := json.Marshal(details)
	if err != nil {
		return sql.NullString{}, false
	}
	return sql.NullString{String: string(b), Valid: true}, true
}

func executionAccountCurrency(details map[string]string) string {
	raw := strings.TrimSpace(details["account_currency"])
	if len(raw) != 3 {
		return ""
	}
	raw = strings.ToUpper(raw)
	for _, ch := range raw {
		if ch < 'A' || ch > 'Z' {
			return ""
		}
	}
	return raw
}

func isUniqueConstraint(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "constraint")
}

func (s *Server) handleListExecutions(c *echo.Context) error {
	accountID := c.QueryParam("account_id")
	if accountID == "" {
		return Fail(http.StatusBadRequest, "bad_request", "account_id is required", nil)
	}
	rows, err := s.deps.Store.ListExecutionsForAccount(c.Request().Context(), store.ListExecutionsForAccountParams{
		UserID: auth.UserID(c), AccountID: accountID,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list executions", nil)
	}
	if rows == nil {
		rows = []store.Execution{}
	}
	return c.JSON(http.StatusOK, toExecutionDTOs(rows))
}

func (s *Server) handleUpdateExecution(c *echo.Context) error {
	uid := auth.UserID(c)
	execID := c.Param("id")
	var in updateExecutionReq
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	if in.Side != "buy" && in.Side != "sell" {
		return Fail(http.StatusBadRequest, "bad_request", "side must be buy or sell", nil)
	}
	if !(in.Quantity > 0) || in.Price < 0 {
		return Fail(http.StatusBadRequest, "bad_request", "quantity must be > 0 and price >= 0", nil)
	}
	if in.ExecutedAt.IsZero() {
		return Fail(http.StatusBadRequest, "bad_request", "executed_at is required", nil)
	}

	ex, err := s.deps.Store.GetExecution(c.Request().Context(), store.GetExecutionParams{
		ID: execID, UserID: uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusNotFound, "not_found", "execution not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load execution", nil)
	}

	commission := 0.0
	if in.Commission != nil {
		commission = *in.Commission
	}
	// This endpoint edits side/quantity/price/time only, so the contract comes
	// from the stored row — but it still has to take part in the key, or an
	// edit would rewrite an option's hash back to the bare-symbol form.
	details := map[string]string{}
	if ex.Details.Valid && ex.Details.String != "" {
		_ = json.Unmarshal([]byte(ex.Details.String), &details)
	}
	hash := importer.DedupHash(
		importer.OptionDedupSymbolFromDetails(ex.Symbol, ex.InstrumentType, details),
		in.Side, in.Quantity, in.Price, in.ExecutedAt,
	)
	n, err := s.deps.Store.UpdateExecution(c.Request().Context(), store.UpdateExecutionParams{
		Side: in.Side, Quantity: in.Quantity, Price: in.Price,
		Fees: in.Fees, Commission: commission, ExecutedAt: in.ExecutedAt,
		DedupHash: hash, ID: execID, UserID: uid,
	})
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not update execution (duplicate fill?)", nil)
	}
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "execution not found", nil)
	}
	if err := s.deps.Trades.Regroup(c.Request().Context(), uid, ex.AccountID); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not regroup trades", nil)
	}
	tradeID, err := s.deps.Store.GetTradeIDForExecution(c.Request().Context(), execID)
	if errors.Is(err, sql.ErrNoRows) {
		tradeID = ""
	} else if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not resolve trade", nil)
	}
	return c.JSON(http.StatusOK, map[string]string{
		"execution_id": execID,
		"trade_id":     tradeID,
	})
}

func (s *Server) handleDeleteExecution(c *echo.Context) error {
	uid := auth.UserID(c)
	execID := c.Param("id")
	ex, err := s.deps.Store.GetExecution(c.Request().Context(), store.GetExecutionParams{
		ID: execID, UserID: uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusNotFound, "not_found", "execution not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load execution", nil)
	}

	prevTradeID, err := s.deps.Store.GetTradeIDForExecution(c.Request().Context(), execID)
	var siblingIDs []string
	if err == nil {
		fills, ferr := s.deps.Store.ListExecutionsForTrade(c.Request().Context(), prevTradeID)
		if ferr == nil {
			for _, f := range fills {
				if f.ID != execID {
					siblingIDs = append(siblingIDs, f.ID)
				}
			}
		}
	}

	n, err := s.deps.Store.DeleteExecution(c.Request().Context(), store.DeleteExecutionParams{
		ID: execID, UserID: uid,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete execution", nil)
	}
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "execution not found", nil)
	}
	if err := s.deps.Trades.Regroup(c.Request().Context(), uid, ex.AccountID); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not regroup trades", nil)
	}

	tradeID := ""
	for _, sid := range siblingIDs {
		tid, gerr := s.deps.Store.GetTradeIDForExecution(c.Request().Context(), sid)
		if gerr == nil {
			tradeID = tid
			break
		}
	}
	return c.JSON(http.StatusOK, map[string]string{
		"execution_id": execID,
		"trade_id":     tradeID,
	})
}
