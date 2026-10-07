import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.types";
import { RequireRole } from "../auth/roles.decorator";
import { CreateWarehouseDto, FefoPreviewDto, StockInDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";

@Controller()
@RequireRole("owner")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("warehouses") listWarehouses() { return this.inventory.listWarehouses(); }
  @Post("warehouses") createWarehouse(@Body() body: CreateWarehouseDto) { return this.inventory.createWarehouse(body); }

  @Get("inventory/stock") @RequireRole("owner", "cashier") getStock() { return this.inventory.stockSummary(); }
  @Post("inventory/stock-in") receiveStock(@Body() body: StockInDto, @Req() request: AuthenticatedRequest) {
    return this.inventory.receiveStock(body, request.user.sub);
  }

  @Post("inventory/fefo/preview")
  @RequireRole("owner", "cashier")
  previewFefo(@Body() body: FefoPreviewDto) { return this.inventory.previewFefo(body); }

  @Get("products/:id/batches") listProductBatches(@Param("id") id: string) {
    return this.inventory.listProductBatches(id);
  }
}
