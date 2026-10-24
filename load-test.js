import http from "k6/http";
import { check, sleep } from "k6";

const API_URL = __ENV.API_URL || "http://localhost:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "test-token";
const TENANT_ID = __ENV.TENANT_ID || "test-tenant";

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // Ramp up to 10 VU
    { duration: "1m30s", target: 50 }, // Ramp up to 50 VU
    { duration: "2m", target: 50 }, // Hold at 50 VU
    { duration: "30s", target: 0 }, // Ramp down to 0 VU
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.1"],
  },
};

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "x-tenant-id": TENANT_ID,
  "Content-Type": "application/json",
};

export default function () {
  // 1. Get products
  let res = http.get(`${API_URL}/products?limit=50`, { headers });
  check(res, {
    "GET /products status is 200": (r) => r.status === 200,
    "products response time < 500ms": (r) => r.timings.duration < 500,
  });
  sleep(1);

  // 2. Get categories
  res = http.get(`${API_URL}/categories`, { headers });
  check(res, {
    "GET /categories status is 200": (r) => r.status === 200,
  });
  sleep(0.5);

  // 3. Get billing status
  res = http.get(`${API_URL}/billing/status`, { headers });
  check(res, {
    "GET /billing/status status is 200": (r) => r.status === 200 || r.status === 404,
  });
  sleep(0.5);

  // 4. Get offline snapshot
  res = http.get(`${API_URL}/offline/snapshot`, { headers });
  check(res, {
    "GET /offline/snapshot status is 200": (r) => r.status === 200,
    "offline snapshot has products": (r) => r.body.includes("products"),
  });
  sleep(0.5);

  // 5. Get customers
  res = http.get(`${API_URL}/customers`, { headers });
  check(res, {
    "GET /customers status is 200": (r) => r.status === 200,
  });
  sleep(1);

  // 6. Get reports
  res = http.get(`${API_URL}/reports/summary`, { headers });
  check(res, {
    "GET /reports/summary status is 200 or 404": (r) => r.status === 200 || r.status === 404,
  });
  sleep(1);

  // 7. POST transaction (checkout simulation)
  const transactionPayload = JSON.stringify({
    items: [
      {
        productId: "prod-1",
        quantity: 2,
        discountAmount: 0,
      },
    ],
    memberStatus: "non-member",
    discountAmount: 0,
    cashReceived: 100000,
  });

  res = http.post(`${API_URL}/transactions`, transactionPayload, {
    headers: {
      ...headers,
      "Idempotency-Key": `load-test-${Date.now()}-${Math.random()}`,
    },
  });
  check(res, {
    "POST /transactions status is 200 or 201 or 400": (r) => [200, 201, 400].includes(r.status),
  });
  sleep(2);
}
