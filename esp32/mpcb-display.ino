/**
 * MPCB SSH — ESP32 Status Display
 * Hardware: ESP32 + DWIN DGUS display (any size, T5L chip)
 * Wiring:   ESP32 TX2(17) → DWIN RX (T+)
 *           ESP32 RX2(16) → DWIN TX (R+)
 *           GND → GND
 *
 * Libraries: ArduinoJson (install via Library Manager)
 *
 * DWIN VP addresses used (set in DGUS Designer):
 *   Each server slot uses 8 consecutive words starting at BASE:
 *   BASE+0  : name       (string, max 16 chars)
 *   BASE+8  : status     (0=offline, 1=online)
 *   BASE+9  : cpu        (0–100, integer)
 *   BASE+10 : mem        (0–100, integer)
 *   BASE+11 : disk       (0–100, integer)
 *   BASE+12 : uptime_h   (hours)
 *   BASE+13 : load1_x100 (load1 * 100, e.g. 0.42 → 42)
 *   BASE+14 : rxKBps     (RX KB/s)
 *   BASE+15 : txKBps     (TX KB/s)
 *
 *   Server 1: 0x1000, Server 2: 0x1010, Server 3: 0x1020 ...
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// ── Config ────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_URL       = "https://YOUR_SERVER/api/kiosk/stats?token=YOUR_TOKEN";

// Set to true if your server has a valid TLS cert (Let's Encrypt etc.)
// Set to false to skip cert verification (self-signed / local)
const bool  VERIFY_TLS    = false;

const int   POLL_INTERVAL = 5000;   // ms between updates
const int   MAX_SERVERS   = 6;      // max cards to show

// DWIN serial (TX=17, RX=16 on most ESP32 boards)
HardwareSerial dwin(2);

// ── DWIN protocol helpers ─────────────────────────────────────────────────────
void dwinWriteWord(uint16_t vpAddr, uint16_t value) {
  uint8_t buf[] = {
    0x5A, 0xA5,
    0x05,                            // data length (cmd + addr + 2 bytes)
    0x82,                            // write command
    (uint8_t)(vpAddr >> 8),
    (uint8_t)(vpAddr & 0xFF),
    (uint8_t)(value >> 8),
    (uint8_t)(value & 0xFF)
  };
  dwin.write(buf, sizeof(buf));
}

void dwinWriteString(uint16_t vpAddr, const char* str, uint8_t maxChars) {
  uint8_t dataLen = (maxChars + 1) & ~1; // round up to even bytes
  uint8_t pktLen  = 3 + dataLen;         // cmd(1) + addr(2) + data
  dwin.write(0x5A); dwin.write(0xA5);
  dwin.write(pktLen);
  dwin.write(0x82);
  dwin.write((uint8_t)(vpAddr >> 8));
  dwin.write((uint8_t)(vpAddr & 0xFF));
  for (uint8_t i = 0; i < dataLen; i++) {
    dwin.write(i < strlen(str) ? (uint8_t)str[i] : 0);
  }
}

// ── Push one server's data to display ────────────────────────────────────────
void pushServer(int slot, JsonObject s) {
  if (slot >= MAX_SERVERS) return;
  uint16_t base = 0x1000 + slot * 0x0010;

  String name = s["name"] | "?";
  dwinWriteString(base + 0, name.c_str(), 16);

  bool online = s["online"] | false;
  dwinWriteWord(base + 8, online ? 1 : 0);

  if (online) {
    dwinWriteWord(base + 9,  (uint16_t)(s["cpu"]  | 0));
    dwinWriteWord(base + 10, (uint16_t)(s["mem"]  | 0));
    dwinWriteWord(base + 11, (uint16_t)(s["disk"] | 0));

    long uptime = s["uptime"] | 0;
    dwinWriteWord(base + 12, (uint16_t)(uptime / 3600));

    float load1 = s["load1"] | 0.0f;
    dwinWriteWord(base + 13, (uint16_t)(load1 * 100));

    long rxBps = s["rxBps"] | 0;
    long txBps = s["txBps"] | 0;
    dwinWriteWord(base + 14, (uint16_t)(rxBps / 1024));
    dwinWriteWord(base + 15, (uint16_t)(txBps / 1024));
  } else {
    // clear stats for offline server
    for (int i = 9; i <= 15; i++) dwinWriteWord(base + i, 0);
  }
}

// ── Clear unused slots ────────────────────────────────────────────────────────
void clearSlot(int slot) {
  uint16_t base = 0x1000 + slot * 0x0010;
  dwinWriteString(base, "", 16);
  for (int i = 8; i <= 15; i++) dwinWriteWord(base + i, 0);
}

// ── Fetch and update ──────────────────────────────────────────────────────────
void fetchAndUpdate() {
  WiFiClientSecure client;
  if (!VERIFY_TLS) client.setInsecure();

  HTTPClient http;
  http.begin(client, API_URL);
  http.setTimeout(8000);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[HTTP] error: %d\n", code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("[JSON] error: %s\n", err.c_str());
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  int count = 0;
  for (JsonObject s : arr) {
    pushServer(count++, s);
    if (count >= MAX_SERVERS) break;
  }
  for (int i = count; i < MAX_SERVERS; i++) clearSlot(i);

  Serial.printf("[OK] updated %d server(s)\n", count);
}

// ── Setup / loop ──────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  dwin.begin(115200, SERIAL_8N1, 16, 17);  // RX=16, TX=17
  delay(500);

  Serial.println("[MPCB] connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[MPCB] connected: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    fetchAndUpdate();
  } else {
    Serial.println("[WiFi] reconnecting...");
    WiFi.reconnect();
    delay(5000);
  }
  delay(POLL_INTERVAL);
}
