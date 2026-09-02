// TraderMemosSync.mq5
// Attach this Expert Advisor to any MT5 chart to send filled deals to TraderMemos.
#property strict
#property version "1.11"

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
   return "TraderMemosSync_MT5_" + TraderMemosAccountId + "_" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
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

string ResponseText(uchar &result[])
{
   string text = CharArrayToString(result, 0, ArraySize(result), CP_UTF8);
   if(StringLen(text) > 260) text = StringSubstr(text, 0, 260) + "...";
   return text;
}

string AccountMetricsJson()
{
   string payload = "";
   payload += "\"mt_account_login\":\"" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   payload += "\"mt_broker\":\"" + JsonEscape(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   payload += "\"account_currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   payload += "\"account_balance\":\"" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\",";
   payload += "\"account_equity\":\"" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\",";
   payload += "\"account_margin\":\"" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + "\",";
   payload += "\"account_free_margin\":\"" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + "\",";
   payload += "\"account_margin_level\":\"" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2) + "\",";
   payload += "\"account_leverage\":\"" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LEVERAGE)) + "\"";
   return payload;
}

string IsoUtc(datetime value)
{
   MqlDateTime dt;
   TimeToStruct(value - ServerUtcOffsetHours * 3600, dt);
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

int PostExecution(ulong ticket)
{
   string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(symbol == "" || (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)) return 0;

   string instrument = InstrumentType(symbol);
   string side = type == DEAL_TYPE_BUY ? "buy" : "sell";
   double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double commission = MathAbs(HistoryDealGetDouble(ticket, DEAL_COMMISSION));
   double swap = MathAbs(HistoryDealGetDouble(ticket, DEAL_SWAP));
   double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   datetime executedAt = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

   string payload = "{";
   payload += "\"account_id\":\"" + JsonEscape(TraderMemosAccountId) + "\",";
   payload += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
   payload += "\"instrument_type\":\"" + instrument + "\",";
   payload += "\"side\":\"" + side + "\",";
   payload += "\"quantity\":" + DoubleToString(volume, 8) + ",";
   payload += "\"price\":" + DoubleToString(price, 8) + ",";
   payload += "\"fees\":" + DoubleToString(swap, 8) + ",";
   payload += "\"commission\":" + DoubleToString(commission, 8) + ",";
   payload += "\"executed_at\":\"" + IsoUtc(executedAt) + "\",";
   payload += "\"multiplier\":" + DoubleToString(MultiplierFor(symbol, instrument), 2) + ",";
   payload += "\"details\":{\"source\":\"metatrader5\",\"ticket\":\"" + IntegerToString((long)ticket) + "\",\"broker_profit\":\"" + DoubleToString(profit, 8) + "\"," + AccountMetricsJson() + "}";
   payload += "}";

   uchar body[];
   int bytes = StringToCharArray(payload, body, 0, WHOLE_ARRAY, CP_UTF8);
   if(bytes > 0) ArrayResize(body, bytes - 1);
   uchar result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + TraderMemosToken + "\r\n";
   string url = TraderMemosServer + "/api/v1/executions";
   ResetLastError();
   int status = WebRequest("POST", url, headers, 10000, body, result, resultHeaders);
   if(status == 201)
   {
      Log("synced MT5 deal " + IntegerToString((long)ticket) + " " + symbol + " " + side + " balance=" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + " equity=" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + " margin=" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2));
      return 1;
   }
   if(status == 200 || status == 409)
   {
      Log("deal already in journal " + IntegerToString((long)ticket) + " (HTTP " + IntegerToString(status) + ")");
      return 2;
   }
   if(status == -1)
   {
      int error = GetLastError();
      Log("WebRequest failed for deal " + IntegerToString((long)ticket) + " with error " + IntegerToString(error) + ". In MT5 add " + TraderMemosServer + " under Tools > Options > Expert Advisors > Allow WebRequest.");
      return -1;
   }
   Log("server rejected deal " + IntegerToString((long)ticket) + " with HTTP " + IntegerToString(status) + ": " + ResponseText(result));
   return -1;
}

void SyncHistory()
{
   if(TraderMemosToken == "" || TraderMemosAccountId == "")
   {
      Log("token and account id are required.");
      return;
   }

   datetime from = TimeCurrent() - LookbackDays * 86400;
   if(!HistorySelect(from, TimeCurrent()))
   {
      Log("HistorySelect failed.");
      return;
   }

   ulong lastTicket = 0;
   if(GlobalVariableCheck(StateKey())) lastTicket = (ulong)GlobalVariableGet(StateKey());

   ulong newestOk = lastTicket;
   int total = HistoryDealsTotal();
   int attempted = 0;
   int synced = 0;
   int duplicates = 0;
   int failed = 0;
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= lastTicket) continue;
      int result = PostExecution(ticket);
      if(result == 0) continue;
      attempted++;
      if(result == 1) synced++;
      if(result == 2) duplicates++;
      if(result < 0) failed++;
      if(result > 0 && ticket > newestOk) newestOk = ticket;
   }
   if(newestOk > lastTicket) GlobalVariableSet(StateKey(), (double)newestOk);
   Log("history check complete: deals=" + IntegerToString(total) + ", attempted=" + IntegerToString(attempted) + ", synced=" + IntegerToString(synced) + ", already_present=" + IntegerToString(duplicates) + ", failed=" + IntegerToString(failed));
}

int OnInit()
{
   if(ResetSyncState && GlobalVariableCheck(StateKey()))
   {
      GlobalVariableDel(StateKey());
      Log("sync state reset; old deals in the lookback window will be checked again.");
   }
   Log("started for MT5 login " + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + " using server " + TraderMemosServer + " and journal account " + TraderMemosAccountId);
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
