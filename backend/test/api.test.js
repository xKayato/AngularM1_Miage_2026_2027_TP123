import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

test("GET /api/tracks refuse sans token", async () => {
  const r = await fetch(base + "/api/tracks?title=blues");
  assert.equal(r.status, 401);
});

test("GET /api/tracks applique le filtre title avec insensibilité à la casse", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const fakeUserId = "64b0f9f8e4b0a1a2b3c4d5e6";
  const token = jwt.sign({ sub: fakeUserId, email: "demo@example.com" }, "tp1-development-secret");

  const originalFind = Track.find;
  const originalCount = Track.countDocuments;

  let capturedFindFilter = null;
  let capturedCountFilter = null;

  try {
    Track.find = (filter) => {
      capturedFindFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              select: () => ({
                lean: async () => [
                  { _id: new mongoose.Types.ObjectId(), title: "Blues Song", ownerId: fakeUserId },
                ],
              }),
            }),
          }),
        }),
      };
    };

    Track.countDocuments = async (filter) => {
      capturedCountFilter = filter;
      return 1;
    };

    const r = await fetch(base + "/api/tracks?page=1&limit=5&title=Blues", {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.total, 1);
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].title, "Blues Song");

    // Vérification du filtre passé à Mongoose
    assert.equal(capturedFindFilter.ownerId, fakeUserId);
    assert.equal(capturedFindFilter.title.$options, "i");
    assert.equal(capturedFindFilter.title.$regex, "Blues");

    assert.equal(capturedCountFilter.ownerId, fakeUserId);
    assert.equal(capturedCountFilter.title.$options, "i");
    assert.equal(capturedCountFilter.title.$regex, "Blues");
  } finally {
    Track.find = originalFind;
    Track.countDocuments = originalCount;
  }
});

test("GET /api/tracks échappe les caractères spéciaux Regex dans title", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const fakeUserId = "64b0f9f8e4b0a1a2b3c4d5e6";
  const token = jwt.sign({ sub: fakeUserId, email: "demo@example.com" }, "tp1-development-secret");

  const originalFind = Track.find;
  const originalCount = Track.countDocuments;

  let capturedFilter = null;

  try {
    Track.find = (filter) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              select: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }),
      };
    };

    Track.countDocuments = async () => 0;

    const r = await fetch(base + "/api/tracks?title=rock%2Broll*(test)", {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(r.status, 200);
    assert.equal(capturedFilter.title.$regex, "rock\\+roll\\*\\(test\\)");
    assert.equal(capturedFilter.title.$options, "i");
  } finally {
    Track.find = originalFind;
    Track.countDocuments = originalCount;
  }
});

test("GET /api/tracks sans paramètre title ne filtre pas par titre", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const fakeUserId = "64b0f9f8e4b0a1a2b3c4d5e6";
  const token = jwt.sign({ sub: fakeUserId, email: "demo@example.com" }, "tp1-development-secret");

  const originalFind = Track.find;
  const originalCount = Track.countDocuments;

  let capturedFilter = null;

  try {
    Track.find = (filter) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              select: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }),
      };
    };

    Track.countDocuments = async () => 0;

    const r = await fetch(base + "/api/tracks?page=1&limit=5", {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(r.status, 200);
    assert.equal(capturedFilter.ownerId, fakeUserId);
    assert.equal(capturedFilter.title, undefined);
  } finally {
    Track.find = originalFind;
    Track.countDocuments = originalCount;
  }
});

