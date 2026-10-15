import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:4000";
const SLUG = __ENV.SLUG;

export const options = {
  scenarios: {
    katalog: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 2,
      maxVUs: 5,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"], // angka awal, sesuaikan nanti
  },
};

export function setup() {
  if (!SLUG) throw new Error("Isi SLUG, contoh: k6 run -e SLUG=slug-toko k6/katalog.js");
}

export default function () {
  const res = http.get(`${BASE}/public/catalog/${SLUG}`);
  check(res, { "status 200": (r) => r.status === 200 });
}
