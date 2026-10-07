import { ConfigService } from "@nestjs/config";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupService } from "./backup.service";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  s3Options: [] as unknown[],
  spawn: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  createReadStream: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public readonly input: Record<string, unknown>) {} }
  return {
    S3Client: class { constructor(options: unknown) { mocks.s3Options.push(options); } send = mocks.send; },
    PutObjectCommand: class PutObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
  };
});
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({ createReadStream: mocks.createReadStream }));
vi.mock("node:fs/promises", () => ({ mkdtemp: mocks.mkdtemp, rm: mocks.rm, stat: mocks.stat }));

const fullConfig = { S3_BACKUP_BUCKET: "backups", S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" };
const config = (values: Record<string, string | undefined>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;
type Sent = { constructor: { name: string }; input: Record<string, unknown> };
const sentOf = (name: string) => mocks.send.mock.calls.map(([command]) => command as Sent).filter((command) => command.constructor.name === name);

function fakeProcess(code: number | null, stderr = "", error?: Error) {
  const child = Object.assign(new EventEmitter(), { stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }) });
  setImmediate(() => {
    if (stderr) child.stderr.emit("data", stderr);
    if (error) child.emit("error", error);
    else child.emit("close", code);
  });
  return child;
}

function makeService(values: Record<string, string | undefined> = fullConfig) {
  const service = new BackupService(config(values));
  const logger = (service as unknown as { logger: { log: () => void; warn: () => void; error: () => void } }).logger;
  return {
    service,
    log: vi.spyOn(logger, "log").mockImplementation(() => undefined),
    warn: vi.spyOn(logger, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(logger, "error").mockImplementation(() => undefined),
  };
}

beforeEach(() => {
  mocks.send.mockReset();
  mocks.s3Options.length = 0;
  mocks.spawn.mockReset().mockImplementation(() => fakeProcess(0));
  mocks.mkdtemp.mockReset().mockResolvedValue("/tmp/hni-pos-backup-x");
  mocks.rm.mockReset().mockResolvedValue(undefined);
  mocks.stat.mockReset().mockResolvedValue({ size: 3 * 1_048_576 });
  mocks.createReadStream.mockReset().mockReturnValue("stream");
  vi.stubEnv("DATABASE_URL", "postgresql://pos%40user:p%40ss@db.internal:6543/hni_pos?sslmode=require");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T20:00:00.123Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("BackupService configuration", () => {
  it("builds an S3 client for custom endpoints with path-style addressing", () => {
    makeService({ ...fullConfig, S3_ENDPOINT: "https://r2.test", S3_REGION: "apac" });
    expect(mocks.s3Options[0]).toEqual({
      endpoint: "https://r2.test", region: "apac", forcePathStyle: true, credentials: { accessKeyId: "key", secretAccessKey: "secret" },
    });
    makeService();
    expect(mocks.s3Options[1]).toEqual({ region: "auto", forcePathStyle: false, credentials: { accessKeyId: "key", secretAccessKey: "secret" } });
  });

  it.each([
    ["no credentials", { S3_BACKUP_BUCKET: "backups" }, true],
    ["no bucket", { S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" }, true],
    ["no DATABASE_URL", fullConfig, false],
  ])("is disabled with %s", async (_label, values, keepDatabaseUrl) => {
    if (!keepDatabaseUrl) vi.stubEnv("DATABASE_URL", "");
    const { service, warn } = makeService(values);
    service.onModuleInit();
    expect(warn).toHaveBeenCalledOnce();
    await service.backupDaily();
    expect(mocks.mkdtemp).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not warn when fully configured", () => {
    const { service, warn } = makeService();
    service.onModuleInit();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("BackupService.backupDaily", () => {
  it("dumps with pg_dump, uploads encrypted and prunes backups older than 30 days across pages", async () => {
    const old = new Date("2026-09-01T00:00:00Z");
    const fresh = new Date("2026-10-01T00:00:00Z");
    mocks.send.mockImplementation((command: Sent) => {
      if (command.constructor.name !== "ListObjectsV2Command") return Promise.resolve({});
      return Promise.resolve(command.input.ContinuationToken
        ? { Contents: [{ Key: "daily/old-2", LastModified: old }], IsTruncated: false }
        : { Contents: [{ Key: "daily/old-1", LastModified: old }, { Key: "daily/new", LastModified: fresh }, { LastModified: old }, { Key: "daily/no-date" }],
          IsTruncated: true, NextContinuationToken: "page-2" });
    });
    const { service, log, error } = makeService();
    await service.backupDaily();

    expect(error).not.toHaveBeenCalled();
    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe("pg_dump");
    expect(args).toEqual(["--format=custom", "--no-owner", "--no-acl", "--host", "db.internal", "--port", "6543",
      "--username", "pos@user", "--dbname", "hni_pos", "--file", "/tmp/hni-pos-backup-x/database.dump"]);
    expect(options.env).toMatchObject({ PGPASSWORD: "p@ss", PGSSLMODE: "require" });

    expect(sentOf("PutObjectCommand")[0].input).toEqual({
      Bucket: "backups", Key: "daily/2026-10-07/hni-pos-2026-10-07T20-00-00-123Z.dump", Body: "stream",
      ContentLength: 3 * 1_048_576, ServerSideEncryption: "AES256", ContentType: "application/octet-stream",
    });
    const lists = sentOf("ListObjectsV2Command");
    expect(lists.map(({ input }) => input)).toEqual([
      { Bucket: "backups", Prefix: "daily/", ContinuationToken: undefined },
      { Bucket: "backups", Prefix: "daily/", ContinuationToken: "page-2" },
    ]);
    expect(sentOf("DeleteObjectsCommand").map(({ input }) => input)).toEqual([
      { Bucket: "backups", Delete: { Quiet: true, Objects: [{ Key: "daily/old-1" }] } },
      { Bucket: "backups", Delete: { Quiet: true, Objects: [{ Key: "daily/old-2" }] } },
    ]);
    expect(log).toHaveBeenCalledWith("Backup database harian selesai (3 MiB).");
    expect(mocks.rm).toHaveBeenCalledWith("/tmp/hni-pos-backup-x", { recursive: true, force: true });
  });

  it("skips delete calls when nothing is stale and uses default port without sslmode", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost/db");
    mocks.send.mockResolvedValue({});
    const { service } = makeService();
    await service.backupDaily();
    const [, args, options] = mocks.spawn.mock.calls[0];
    expect(args).toContain("5432");
    expect(options.env).not.toHaveProperty("PGSSLMODE");
    expect(sentOf("DeleteObjectsCommand")).toHaveLength(0);
  });

  it("logs pg_dump failures with stderr, skips upload and still cleans up", async () => {
    mocks.spawn.mockImplementation(() => fakeProcess(1, "connection refused\n"));
    const { service, error } = makeService();
    await service.backupDaily();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Backup database harian gagal.", expect.stringContaining("pg_dump keluar dengan kode 1: connection refused"));
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("handles spawn errors (pg_dump missing) and upload failures", async () => {
    mocks.spawn.mockImplementationOnce(() => fakeProcess(null, "", new Error("spawn pg_dump ENOENT")));
    const { service, error } = makeService();
    await service.backupDaily();
    expect(error).toHaveBeenLastCalledWith("Backup database harian gagal.", expect.stringContaining("ENOENT"));

    mocks.send.mockRejectedValueOnce("s3 down");
    await service.backupDaily();
    expect(error).toHaveBeenLastCalledWith("Backup database harian gagal.", undefined);
    expect(mocks.rm).toHaveBeenCalledTimes(2);
  });
});
