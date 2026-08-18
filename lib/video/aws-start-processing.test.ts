import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { CreateJobCommand } from "@aws-sdk/client-mediaconvert";
import { VideoProviderError } from "./provider";

const { s3Send, mcSend } = vi.hoisted(() => ({
  s3Send: vi.fn(),
  mcSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send(command: unknown) {
        return s3Send(command);
      }
    },
  };
});

vi.mock("@aws-sdk/client-mediaconvert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-mediaconvert")>();
  return {
    ...actual,
    MediaConvertClient: class {
      send(command: unknown) {
        return mcSend(command);
      }
    },
  };
});

const { awsProvider } = await import("./aws");

function configureAws() {
  vi.stubEnv("AWS_REGION", "ap-south-1");
  vi.stubEnv("AWS_S3_BUCKET", "test-bucket");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("AWS_MEDIACONVERT_ENDPOINT", "https://mediaconvert.ap-south-1.amazonaws.com");
  vi.stubEnv("AWS_MEDIACONVERT_ROLE_ARN", "arn:aws:iam::123456789012:role/TestMediaConvert");
}

describe("awsProvider.startProcessing", () => {
  beforeEach(() => {
    configureAws();
    s3Send.mockReset();
    mcSend.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not create a MediaConvert job when the original upload is missing", async () => {
    s3Send.mockRejectedValueOnce(
      new NotFound({
        message: "Not Found",
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await expect(awsProvider.startProcessing("asset-missing")).rejects.toSatisfy((error) => {
      return (
        error instanceof VideoProviderError &&
        error.message === "upload not found — did the file finish uploading?"
      );
    });
    expect(mcSend).not.toHaveBeenCalled();
    expect(s3Send).toHaveBeenCalledTimes(1);
    const command = s3Send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect((command as HeadObjectCommand).input).toEqual({
      Bucket: "test-bucket",
      Key: "uploads/asset-missing/original",
    });
  });

  it("creates a MediaConvert job after HeadObject confirms the upload", async () => {
    s3Send.mockResolvedValueOnce({});
    mcSend.mockResolvedValueOnce({});

    await awsProvider.startProcessing("asset-present");

    expect(s3Send).toHaveBeenCalledTimes(1);
    expect(mcSend).toHaveBeenCalledTimes(1);
    expect(mcSend.mock.calls[0]?.[0]).toBeInstanceOf(CreateJobCommand);
  });
});
