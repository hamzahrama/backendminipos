import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly bucket: string;
  private readonly s3: S3Client | null;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>("S3_BACKUP_BUCKET") ?? "";
    const endpoint = config.get<string>("S3_ENDPOINT");
    const accessKeyId = config.get<string>("S3_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("S3_SECRET_ACCESS_KEY");
    const region = config.get<string>("S3_REGION") ?? "auto";
    this.s3 = accessKeyId && secretAccessKey
      ? new S3Client({ ...(endpoint ? { endpoint } : {}), region, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId, secretAccessKey } })
      : null;
  }

  onModuleInit() {
    if (!this.isConfigured()) {
      const hasAnyS3Config = Boolean(this.bucket || this.s3);
      if (hasAnyS3Config || process.env.NODE_ENV === "production") {
        this.logger.warn("Backup harian nonaktif; konfigurasi S3_BACKUP_BUCKET dan akses S3 untuk mengaktifkannya.");
      } else {
        this.logger.log("Backup harian nonaktif (mode lokal; S3_BACKUP_BUCKET belum diatur).");
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: "Asia/Jakarta" })
  async backupDaily() {
    if (!this.isConfigured()) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prefix = `daily/${timestamp.slice(0, 10)}`;
    const folder = await mkdtemp(join(tmpdir(), "hni-pos-backup-"));
    const filepath = join(folder, "database.dump");
    try {
      await this.dumpDatabase(filepath);
      const info = await stat(filepath);
      const key = `${prefix}/hni-pos-${timestamp}.dump`;
      await this.s3!.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: createReadStream(filepath), ContentLength: info.size,
        ServerSideEncryption: "AES256", ContentType: "application/octet-stream",
      }));
      await this.deleteExpiredBackups(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      this.logger.log(`Backup database harian selesai (${Math.ceil(info.size / 1_048_576)} MiB).`);
    } catch (error) {
      this.logger.error("Backup database harian gagal.", error instanceof Error ? error.stack : undefined);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  private isConfigured() { return Boolean(this.bucket && this.s3 && process.env.DATABASE_URL); }

  private async dumpDatabase(filepath: string) {
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(databaseUrl.password), ...(databaseUrl.searchParams.get("sslmode") ? { PGSSLMODE: databaseUrl.searchParams.get("sslmode")! } : {}) };
    const args = ["--format=custom", "--no-owner", "--no-acl", "--host", databaseUrl.hostname,
      "--port", String(databaseUrl.port || 5432), "--username", decodeURIComponent(databaseUrl.username),
      "--dbname", databaseUrl.pathname.replace(/^\//, ""), "--file", filepath];
    await new Promise<void>((resolve, reject) => {
      const process = spawn("pg_dump", args, { env, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      process.stderr.setEncoding("utf8");
      process.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
      process.once("error", reject);
      process.once("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump keluar dengan kode ${code}: ${stderr.trim()}`)));
    });
  }

  private async deleteExpiredBackups(cutoff: Date) {
    let continuationToken: string | undefined;
    do {
      const page = await this.s3!.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: "daily/", ContinuationToken: continuationToken }));
      const stale = (page.Contents ?? []).filter((item) => item.Key && item.LastModified && item.LastModified < cutoff);
      if (stale.length) await this.s3!.send(new DeleteObjectsCommand({
        Bucket: this.bucket, Delete: { Quiet: true, Objects: stale.flatMap(({ Key }) => Key ? [{ Key }] : []) },
      }));
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}
