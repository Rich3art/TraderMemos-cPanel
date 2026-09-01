// TraderMemosSync.mq4
// Attach this Expert Advisor to any MT4 chart to send closed order fills to TraderMemos.
#property strict
#property version "1.10"

input string TraderMemosServer = "https://journal.ranksmedia.com";
input string TraderMemosToken = "";
input string TraderMemosAccountId = "";
input int SyncSeconds = 60;
input int LookbackDays = 365;
input int ServerUtcOffsetHours = 2;
input bool PrintSyncMessages = true;
input bool ResetSyncState = false;

string StateKey()
{
   return "TraderMemosSync_MT4_" + TraderMemosAccountId + "_" + IntegerToString(AccountNumber());
}

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   return value;
}

void Log(string message)
{
   if(PrintSyncMessages) Print("TraderMemosSync: " + message);
}

string ResponseText(char &result[])
{
   string text = CharArrayToString(result, 0, ArraySize(result), CP_UTF8);
   if(StringLen(text) > 260) text = StringSubstr(text, 0, 260) + "...";
   return text;
}

string AccountMetricsJson()
{
   string payload = "";
   payload += "\"mt_account_login\":\"" + IntegerToString(AccountNumber()) + "\",";
   payload += "\"mt_broker\":\"" + JsonEscape(AccountCompany()) + "\",";
   payload += "\"account_currency\":\"" + JsonEscape(AccountCurrency()) + "\",";
   payload += "\"account_balance\":\"" + DoubleToString(AccountBalance(), 2) + "\",";
   payload += "\"account_equity\":\"" + DoubleToString(AccountEquity(), 2) + "\",";
   payload += "\"account_margin\":\"" + DoubleToString(AccountMargin(), 2) + "\",";
   payload += "\"account_free_margin\":\"" + DoubleToString(AccountFreeMargin(), 2) + "\",";
   payload += "\"account_leverage\":\"" + IntegerToString(AccountLeverage()) + "\"";
   return payload;
}

string IsoUtc(datetime value)
{
   datetime utc = value - ServerUtcOffsetHours * 3600;
   MqlDateTime dt;
   TimeToStruct(utc, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

string InstrumentType(string symbol)
{
   string s = symbol;
   StringToUpper(s);
   if(StringFind(s, "BTC") >= 0 || StringFind(s, "ETH") >= 0 || StringFind(s, "USDT") >= 0) return "crypto";
   if(StringLen(s) == 6) return "forex";
   if(StringFind(s, "XAU") >= 0 || StringFind(s, "XAG") >= 0) return "forex";
   return "cfd";
}

double MultiplierFor(string symbol, string instrument)
{
   string s = symbol;
   StringToUpper(s);
   if(instrument == "forex")
   {
      if(StringFind(s, "XAU") >= 0) return 100.0;
      if(StringFind(s, "XAG") >= 0) return 5000.0;
      return 100000.0;
   }
   return 1.0;
}

int PostExecution(int ticket, string suffix, string side, datetime executedAt, double fees, double commission)
{
   string symbol = OrderSymbol();
   string instrument = InstrumentType(symbol);
   double volume = OrderLots();
   double price = suffix == "open" ? OrderOpenPrice() : OrderClosePrice();
   if(symbol == "" || volume <= 0 || price <= 0 || executedAt <= 0) return 0;

   string payload = "{";
   payload += "\"account_id\":\"" + JsonEscape(TraderMemosAccountId) + "\",";
   payload += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
   payload += "\"instrument_type\":\"" + instrument + "\",";
   payload += "\"side\":\"" + side + "\",";
   payload += "\"quantity\":" + DoubleToString(volume, 8) + ",";
   payload += "\"price\":" + DoubleToString(price, 8) + ",";
   payload += "\"fees\":" + DoubleToString(MathAbs(fees), 8) + ",";
   payload += "\"commission\":" + DoubleToString(MathAbs(commission), 8) + ",";
   payload += "\"executed_at\":\"" + IsoUtc(executedAt) + "\",";
   payload += "\"multiplier\":" + DoubleToString(MultiplierFor(symbol, instrument), 2) + ",";
   payload += "\"details\":{\"source\":\"metatrader4\",\"ticket\":\"" + IntegerToString(ticket) + "\",\"fill\":\"" + suffix + "\"," + AccountMetricsJson() + "}";
   payload += "}";

   char body[];
   int bytes = StringToCharArray(payload, body, 0, WHOLE_ARRAY, CP_UTF8);
   if(bytes > 0) ArrayResize(body, bytes - 1);
   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + TraderMemosToken + "\r\n";
   string url = TraderMemosServer + "/api/v1/executions";
   ResetLastError();
   int status = WebRequest("POST", url, headers, 10000, body, result, resultHeaders);
   if(status == 201)
   {
      Log("synced MT4 order " + IntegerToString(ticket) + " " + suffix + " " + symbol + " " + side + " balance=" + DoubleToString(AccountBalance(), 2) + " equity=" + DoubleToString(AccountEquity(), 2) + " margin=" + DoubleToString(AccountMargin(), 2));
      return 1;
   }
   if(status == 200 || status == 409)
   {
      Log("order fill already in journal " + IntegerToString(ticket) + " " + suffix + " (HTTP " + IntegerToString(status) + ")");
      return 2;
   }
   if(status == -1)
   {
      int error = GetLastError();
      Log("WebRequest failed for order " + IntegerToString(ticket) + " with error " + IntegerToString(error) + ". In MT4 add " + TraderMemosServer + " under Tools > Options > Expert Advisors > Allow WebRequest.");
      return -1;
   }
   Log("server rejected order " + IntegerToString(ticket) + " " + suffix + " with HTTP " + IntegerToString(status) + ": " + ResponseText(result));
   return -1;
}

void SyncHistory()
{
   if(TraderMemosToken == "" || TraderMemosAccountId == "")
   {
      Log("token and account id are required.");
      return;
   }

   double last = 0;
   if(GlobalVariableCheck(StateKey())) last = GlobalVariableGet(StateKey());

   int newestOk = (int)last;
   datetime minTime = TimeCurrent() - LookbackDays * 86400;
   int total = OrdersHistoryTotal();
   int attempted = 0;
   int synced = 0;
   int duplicates = 0;
   int failed = 0;
   for(int i = 0; i < total; i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      int ticket = OrderTicket();
      if(ticket <= (int)last) continue;
      if(OrderCloseTime() < minTime) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;

      string openSide = type == OP_BUY ? "buy" : "sell";
      string closeSide = type == OP_BUY ? "sell" : "buy";
      int opened = PostExecution(ticket, "open", openSide, OrderOpenTime(), 0, 0);
      int closed = PostExecution(ticket, "close", closeSide, OrderCloseTime(), MathAbs(OrderSwap()), MathAbs(OrderCommission()));
      if(opened != 0) attempted++;
      if(closed != 0) attempted++;
      if(opened == 1) synced++;
      if(closed == 1) synced++;
      if(opened == 2) duplicates++;
      if(closed == 2) duplicates++;
      if(opened < 0) failed++;
      if(closed < 0) failed++;
      if(opened > 0 && closed > 0 && ticket > newestOk) newestOk = ticket;
   }
   if(newestOk > (int)last) GlobalVariableSet(StateKey(), newestOk);
   Log("history check complete: orders=" + IntegerToString(total) + ", attempted_fills=" + IntegerToString(attempted) + ", synced=" + IntegerToString(synced) + ", already_present=" + IntegerToString(duplicates) + ", failed=" + IntegerToString(failed));
}

int OnInit()
{
   if(ResetSyncState && GlobalVariableCheck(StateKey()))
   {
      GlobalVariableDel(StateKey());
      Log("sync state reset; old orders in the lookback window will be checked again.");
   }
   Log("started for MT4 account " + IntegerToString(AccountNumber()) + " using server " + TraderMemosServer + " and journal account " + TraderMemosAccountId);
   EventSetTimer(MathMax(15, SyncSeconds));
   SyncHistory();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncHistory();
}
