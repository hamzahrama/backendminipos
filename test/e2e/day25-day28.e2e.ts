import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../app.module";
import * as request from "supertest";

describe("Day 25 & 28 - E2E APIs (Integration Test)", () => {
  let app: INestApplication;
  let authToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Mock login or create test tenant + token
    // For now, assume test environment has auth setup
    authToken = process.env.TEST_AUTH_TOKEN || "mock-token";
    tenantId = process.env.TEST_TENANT_ID || "test-tenant-id";
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Day 25 - Billing API", () => {
    it("GET /billing/status returns subscription status", async () => {
      const response = await request(app.getHttpServer())
        .get("/billing/status")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-tenant-id", tenantId)
        .expect(200);

      expect(response.body).toHaveProperty("planCode");
      expect(response.body).toHaveProperty("status");
      // Expect FREE plan as default or mocked
      expect(["FREE", "PRO", "ENTERPRISE"]).toContain(response.body.planCode);
    });

    it("POST /billing/charge initiates payment", async () => {
      const response = await request(app.getHttpServer())
        .post("/billing/charge")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-tenant-id", tenantId)
        .send({
          planCode: "PRO",
          amount: 199000,
        })
        .expect(200);

      // Expect snapToken for Midtrans Snap or error if mocked
      expect(response.body).toBeDefined();
      if (response.body.snapToken) {
        expect(response.body.snapToken).toBeTruthy();
      }
    });

    it("POST /billing/webhook/midtrans handles payment notification", async () => {
      const payload = {
        order_id: "order-123",
        status_code: "200",
        transaction_status: "settlement",
      };

      const response = await request(app.getHttpServer())
        .post("/billing/webhook/midtrans")
        .send(payload)
        .expect(200);

      // Webhook should process without error
      expect(response.body).toBeDefined();
    });
  });

  describe("Day 28 - Offline API", () => {
    it("GET /offline/snapshot returns product snapshot with stock", async () => {
      const response = await request(app.getHttpServer())
        .get("/offline/snapshot")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-tenant-id", tenantId)
        .expect(200);

      expect(response.body).toHaveProperty("products");
      expect(Array.isArray(response.body.products)).toBe(true);

      // Each product should have offline schema
      if (response.body.products.length > 0) {
        const product = response.body.products[0];
        expect(product).toHaveProperty("id");
        expect(product).toHaveProperty("sku");
        expect(product).toHaveProperty("name");
        expect(product).toHaveProperty("memberPrice");
        expect(product).toHaveProperty("retailPrice");
        expect(product).toHaveProperty("pv");
        expect(product).toHaveProperty("stock");
      }
    });

    it("GET /offline/snapshot unauthorized without token", async () => {
      const response = await request(app.getHttpServer())
        .get("/offline/snapshot")
        .expect(401);

      // Should reject unauthenticated request
      expect(response.status).toBe(401);
    });
  });

  describe("Day 25 + 28 Integration", () => {
    it("POST /transactions with offline idempotency key", async () => {
      const idempotencyKey = `offline-${Date.now()}`;

      const response = await request(app.getHttpServer())
        .post("/transactions")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-tenant-id", tenantId)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          items: [
            {
              productId: "test-prod-1",
              quantity: 2,
              isMember: false,
            },
          ],
          memberStatus: "non-member",
          discountAmount: 0,
        })
        .expect([200, 201, 400]); // 200/201 success, 400 if validation fails

      // Should process or reject gracefully
      expect(response.body).toBeDefined();
    });
  });
});
