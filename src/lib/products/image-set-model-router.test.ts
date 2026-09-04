import assert from "node:assert/strict";
import test from "node:test";
import {
  generateImageSetRole,
  type ImageSetRoleGenerationInput,
  type ImageSetRoleProviders,
} from "./image-set-model-router.ts";

const image = (value: string, provider?: string) => ({
  buffer: Buffer.from(value),
  contentType: "image/png",
  ...(provider ? { provider } : {}),
});

const productInput: ImageSetRoleGenerationInput = {
  role: "hero",
  prompt: "identity locked product image",
  heroImageUrl: "data:image/png;base64,aGVybw==",
  rawImageUrls: [
    "data:image/png;base64,YQ==",
    "data:image/png;base64,Yg==",
    "data:image/png;base64,Yw==",
  ],
  aspectRatio: "1:1",
};

function fakeProviders(overrides: Partial<ImageSetRoleProviders> = {}): ImageSetRoleProviders {
  return {
    gpt: async () => image("gpt"),
    seedream: async () => image("seedream"),
    fluxEdit: async () => image("flux"),
    textImage: async () => image("text"),
    removeBg: async (dataUri) => Buffer.from(dataUri),
    ...overrides,
  };
}

test("hero tries GPT then Seedream then FLUX", async () => {
  const attempts: string[] = [];
  const output = await generateImageSetRole(productInput, fakeProviders({
    gpt: async () => { attempts.push("gpt"); throw new Error("timeout"); },
    seedream: async () => { attempts.push("seedream"); throw new Error("provider error"); },
    fluxEdit: async () => { attempts.push("flux"); return image("flux"); },
  }));

  assert.deepEqual(attempts, ["gpt", "seedream", "flux"]);
  assert.equal(output.provider, "flux");
});

test("router preserves the concrete provider returned by an image adapter", async () => {
  const output = await generateImageSetRole(productInput, fakeProviders({
    gpt: async () => { throw new Error("timeout"); },
    seedream: async () => image("seedream", "fal-ai/bytedance/seedream/v4.5/edit"),
  }));
  assert.equal(output.provider, "fal-ai/bytedance/seedream/v4.5/edit");
});

test("product roles cap and deduplicate references while retaining the hero", async () => {
  let references: string[] = [];
  await generateImageSetRole({
    ...productInput,
    rawImageUrls: [
      "raw-1", "raw-1", "raw-2", "raw-3", "raw-4", "raw-5", "raw-6",
    ],
  }, fakeProviders({
    gpt: async (input) => {
      references = input.imageDataUris;
      return image("gpt");
    },
  }));

  assert.equal(references.length, 5);
  assert.equal(references.at(-1), productInput.heroImageUrl);
  assert.equal(new Set(references).size, references.length);
});

test("product roles retain both the product hero and batch hero anchor", async () => {
  let seen: Parameters<ImageSetRoleProviders["gpt"]>[0] | undefined;
  await generateImageSetRole({
    ...productInput,
    batchHeroImageUrl: "batch-hero",
    rawImageUrls: ["raw-1", "raw-2", "raw-3", "raw-4", "raw-5", "raw-6"],
  }, fakeProviders({
    gpt: async (input) => {
      seen = input;
      return image("gpt");
    },
  }));

  assert.equal(seen?.imageDataUris.length, 4);
  assert.equal(seen?.imageDataUris.at(-1), productInput.heroImageUrl);
  assert.equal(seen?.batchHeroImageUrl, "batch-hero");
});

test("a product-free background never calls a product compositor", async () => {
  const attempts: string[] = [];
  const output = await generateImageSetRole({ ...productInput, role: "background" }, fakeProviders({
    gpt: async () => { attempts.push("gpt"); return image("gpt"); },
    seedream: async () => { attempts.push("seedream"); return image("seedream"); },
    fluxEdit: async () => { attempts.push("flux"); return image("flux"); },
    textImage: async (input) => {
      attempts.push("text");
      assert.equal(input.imageDataUris.length, 0);
      return image("text", "fal-ai/flux-2-pro");
    },
  }));

  assert.deepEqual(attempts, ["text"]);
  assert.equal(output.provider, "fal-ai/flux-2-pro");
});

test("background exposes the concrete text fallback provider", async () => {
  const output = await generateImageSetRole({ ...productInput, role: "background" }, fakeProviders({
    textImage: async () => image("fallback", "huggingface:black-forest-labs/FLUX.1-schnell"),
  }));
  assert.equal(output.provider, "huggingface:black-forest-labs/FLUX.1-schnell");
});

test("decoration removal failure is surfaced instead of saving an opaque asset", async () => {
  await assert.rejects(
    () => generateImageSetRole({ ...productInput, role: "decoration" }, fakeProviders({
      removeBg: async () => { throw new Error("upstream failed"); },
    })),
    /裝飾元素.*去背/,
  );
});

test("decoration returns a transparent PNG and provider trace", async () => {
  const output = await generateImageSetRole(
    { ...productInput, role: "decoration" },
    fakeProviders({
      textImage: async (input) => {
        assert.deepEqual(input.imageDataUris, []);
        return { buffer: Buffer.from("opaque"), contentType: "image/jpeg", provider: "fal-ai/flux-2-pro" };
      },
      removeBg: async (dataUri) => {
        assert.match(dataUri, /^data:image\/jpeg;base64,/);
        return Buffer.from("transparent");
      },
    }),
  );

  assert.equal(output.contentType, "image/png");
  assert.equal(output.provider, "fal-ai/flux-2-pro+rembg");
  assert.equal(output.buffer.toString(), "transparent");
});

test("GPT generation sends prompt followed by every deduplicated reference", async () => {
  const { gptImageGenerateWithReferences } = await import("../generate.ts");
  let requestBody: Record<string, unknown> | undefined;
  const output = await gptImageGenerateWithReferences(
    {
      prompt: "preserve this exact product",
      imageDataUris: ["hero", "raw-1", "hero", "raw-2"],
      aspectRatio: "3:2",
      model: "openai/test-image-model",
    },
    {
      apiKey: "test-key",
      fetchFn: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,b2s=" } }] } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  );

  const messages = requestBody?.messages as Array<{ content: Array<Record<string, unknown>> }>;
  const content = messages[0].content;
  assert.deepEqual(content.map((item) => item.type), ["text", "image_url", "image_url", "image_url"]);
  assert.match(String(content[0].text), /preserve this exact product/);
  assert.match(String(content[0].text), /3:2/);
  assert.deepEqual(requestBody?.image_config, { aspect_ratio: "3:2", quality: "high" });
  assert.equal(output.buffer.toString(), "ok");
  assert.equal(output.provider, "openai/test-image-model");
});

test("GPT transport keeps batch hero last and describes it only as a style anchor", async () => {
  const { gptImageGenerateWithReferences } = await import("../generate.ts");
  let requestBody: Record<string, unknown> | undefined;
  await gptImageGenerateWithReferences(
    {
      prompt: "shared direction",
      imageDataUris: ["raw-view", "product-hero"],
      batchHeroImageUrl: "batch-hero",
      model: "openai/test-image-model",
    },
    {
      apiKey: "test-key",
      fetchFn: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,b2s=" } }] } }],
        }), { status: 200 });
      },
    },
  );

  const messages = requestBody?.messages as Array<{ content: Array<Record<string, unknown>> }>;
  const content = messages[0].content;
  const urls = content.slice(1).map((item) => (item.image_url as { url: string }).url);
  assert.deepEqual(urls, ["raw-view", "product-hero", "batch-hero"]);
  assert.match(String(content[0].text), /LAST image.*visual.*(?:consistency|style).*anchor/i);
  assert.match(String(content[0].text), /(?:do not|must not).*(?:product identity|duplicate|copy).*product/i);
});

test("GPT generation installs an exact 90-second timeout signal", async () => {
  const { gptImageGenerateWithReferences } = await import("../generate.ts");
  const timeoutValues: number[] = [];
  await gptImageGenerateWithReferences(
    { prompt: "p", imageDataUris: ["hero"] },
    {
      apiKey: "test-key",
      timeoutSignal: (ms) => {
        timeoutValues.push(ms);
        return new AbortController().signal;
      },
      fetchFn: async () => new Response(JSON.stringify({
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,b2s=" } }] } }],
      }), { status: 200 }),
    },
  );
  assert.deepEqual(timeoutValues, [90_000]);
});

test("GPT generation downloads a remote URL response", async () => {
  const { gptImageGenerateWithReferences } = await import("../generate.ts");
  const calls: string[] = [];
  const output = await gptImageGenerateWithReferences(
    { prompt: "p", imageDataUris: ["hero"], model: "openai/test-remote-model" },
    {
      apiKey: "test-key",
      fetchFn: async (input) => {
        calls.push(String(input));
        if (calls.length === 1) {
          return new Response(JSON.stringify({
            choices: [{ message: { images: [{ image_url: { url: "https://cdn.example/result.webp" } }] } }],
          }), { status: 200 });
        }
        return new Response(Buffer.from("remote-image"), {
          status: 200,
          headers: { "content-type": "image/webp" },
        });
      },
    },
  );
  assert.deepEqual(calls, [
    "https://openrouter.ai/api/v1/chat/completions",
    "https://cdn.example/result.webp",
  ]);
  assert.equal(output.contentType, "image/webp");
  assert.equal(output.buffer.toString(), "remote-image");
  assert.equal(output.provider, "openai/test-remote-model");
});

test("FAL reference adapter treats raw and hero views as one product and batch hero as style anchor", async () => {
  const { falImageGenerateWithReferences } = await import("../generate.ts");
  let requestBody: Record<string, unknown> | undefined;
  const calls: string[] = [];
  const output = await falImageGenerateWithReferences(
    {
      prompt: "shared direction",
      imageDataUris: ["raw-view", "product-hero"],
      batchHeroImageUrl: "batch-hero",
      aspectRatio: "1:1",
      provider: "seedream",
    },
    {
      apiKey: "test-key",
      fetchFn: async (input, init) => {
        calls.push(String(input));
        if (calls.length === 1) {
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ images: [{ url: "https://cdn.example/fal.png" }] }), { status: 200 });
        }
        return new Response(Buffer.from("fal-image"), { status: 200, headers: { "content-type": "image/png" } });
      },
    },
  );

  assert.deepEqual(requestBody?.image_urls, ["raw-view", "product-hero", "batch-hero"]);
  assert.match(String(requestBody?.prompt), /same single product/i);
  assert.match(String(requestBody?.prompt), /LAST image.*visual.*anchor/i);
  assert.doesNotMatch(String(requestBody?.prompt), /side by side/i);
  assert.equal(output.provider, "fal-ai/bytedance/seedream/v4.5/edit");
});

test("GPT generation caps references at five and does not leak provider bodies", async () => {
  const { gptImageGenerateWithReferences } = await import("../generate.ts");
  let sentCount = 0;
  await assert.rejects(
    () => gptImageGenerateWithReferences(
      { prompt: "p", imageDataUris: ["1", "2", "3", "4", "5", "6"] },
      {
        apiKey: "super-secret-key",
        fetchFn: async (_input, init) => {
          const body = JSON.parse(String(init?.body));
          sentCount = body.messages[0].content.filter((item: { type: string }) => item.type === "image_url").length;
          return new Response("provider-secret-debug-body", { status: 500 });
        },
      },
    ),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.doesNotMatch(message, /provider-secret-debug-body|super-secret-key/);
      assert.match(message, /HTTP 500/);
      return true;
    },
  );
  assert.equal(sentCount, 5);
});
