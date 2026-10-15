import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://localhost:4000";

// 401/400 (akun palsu) dan 429 (dibatasi) adalah respons yang kita harapkan
http.setResponseCallback(http.expectedStatuses(400, 401, 429));

export const options = {
  scenarios: {
    login: { executor: "shared-iterations", vus: 1, iterations: 12, maxDuration: "30s" },
  },
  thresholds: { checks: ["rate==1"] },
};

export default function () {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({
      email: "k6@example.com",
      password: "password-k6-123",
      tenantSlug: "toko-k6-tidak-ada",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  const n = exec.scenario.iterationInTest; // 0..11
  if (n < 10) {
    check(res, { "10 percobaan pertama tidak dibatasi": (r) => r.status !== 429 });
  } else {
    check(res, { "percobaan ke-11 dst dibatasi (429)": (r) => r.status === 429 });
  }
}
