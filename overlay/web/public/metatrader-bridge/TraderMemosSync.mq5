// TraderMemosSync.mq5
// Attach this Expert Advisor to any MT5 chart to send filled deals to TraderMemos.
#property strict
#property version "1.00"

input string TraderMemosServer = "https://journal.ranksmedia.com";
input string TraderMemosToken = "";
input string TraderMemosAccountId = "";
input int SyncSeconds = 60;
input int LookbackDays = 365;
input int ServerUtcOffsetHours = 2;

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

bool PostExecution(ulong ticket)
{
   string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(symbol == "" || (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)) return true;

   string instrument = InstrumentType(symbol);
   string side = type == DEAL_TYPE_BUY ? "buy" : "sell";
   double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double commission = MathAbs(HistoryDealGetDouble(ticket, DEAL_COMMISSION));
   double swap = MathAbs(HistoryDealGetDouble(ticket, DEAL_SWAP));
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
   payload += "\"details\":{\"source\":\"metatrader5\",\"ticket\":\"" + IntegerToString((long)ticket) + "\"}";
   payload += "}";

   uchar body[];
   StringToCharArray(payload, body, 0, WHOLE_ARRAY, CP_UTF8);
   uchar result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + TraderMemosToken + "\r\n";
   string url = TraderMemosServer + "/api/v1/executions";
   int status = WebRequest("POST", url, headers, 10000, body, result, resultHeaders);
   return status == 200 || status == 201 || status == 409;
}

void SyncHistory()
{
   if(TraderMemosToken == "" || TraderMemosAccountId == "")
   {
      Print("TraderMemosSync: token and account id are required.");
      return;
   }

   datetime from = TimeCurrent() - LookbackDays * 86400;
   if(!HistorySelect(from, TimeCurrent()))
   {
      Print("TraderMemosSync: HistorySelect failed.");
      return;
   }

   ulong lastTicket = 0;
   if(GlobalVariableCheck(StateKey())) lastTicket = (ulong)GlobalVariableGet(StateKey());

   ulong newestOk = lastTicket;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= lastTicket) continue;
      if(PostExecution(ticket) && ticket > newestOk) newestOk = ticket;
   }
   if(newestOk > lastTicket) GlobalVariableSet(StateKey(), (double)newestOk);
}

int OnInit()
{
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
