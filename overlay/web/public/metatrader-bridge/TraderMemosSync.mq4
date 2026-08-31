// TraderMemosSync.mq4
// Attach this Expert Advisor to any MT4 chart to send closed order fills to TraderMemos.
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
   return "TraderMemosSync_MT4_" + TraderMemosAccountId + "_" + IntegerToString(AccountNumber());
}

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   return value;
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

bool PostExecution(int ticket, string suffix, string side, datetime executedAt, double fees, double commission)
{
   string symbol = OrderSymbol();
   string instrument = InstrumentType(symbol);
   double volume = OrderLots();
   double price = suffix == "open" ? OrderOpenPrice() : OrderClosePrice();
   if(symbol == "" || volume <= 0 || price <= 0 || executedAt <= 0) return true;

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
   payload += "\"details\":{\"source\":\"metatrader4\",\"ticket\":\"" + IntegerToString(ticket) + "\",\"fill\":\"" + suffix + "\"}";
   payload += "}";

   char body[];
   StringToCharArray(payload, body, 0, WHOLE_ARRAY, CP_UTF8);
   char result[];
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

   double last = 0;
   if(GlobalVariableCheck(StateKey())) last = GlobalVariableGet(StateKey());

   int newestOk = (int)last;
   datetime minTime = TimeCurrent() - LookbackDays * 86400;
   int total = OrdersHistoryTotal();
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
      bool opened = PostExecution(ticket, "open", openSide, OrderOpenTime(), 0, 0);
      bool closed = PostExecution(ticket, "close", closeSide, OrderCloseTime(), MathAbs(OrderSwap()), MathAbs(OrderCommission()));
      if(opened && closed && ticket > newestOk) newestOk = ticket;
   }
   if(newestOk > (int)last) GlobalVariableSet(StateKey(), newestOk);
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
