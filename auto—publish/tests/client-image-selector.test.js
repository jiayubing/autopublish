const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_IMAGE_COUNT,
  selectImages,
  normalizeImageCount,
} = require("../src/content/client-image-selector");

describe("client image selector", function () {
  const images = [
    { id: "one", relativePath: "one.png" },
    { id: "two", relativePath: "two.png" },
    { id: "three", relativePath: "three.png" },
  ];

  it("uses an injected random source and samples without replacement", function () {
    const result = selectImages(images, {
      count: 3,
      random: function () {
        return 0;
      },
    });

    assert.deepEqual(
      result.images.map(function (item) {
        return item.id;
      }),
      ["one", "two", "three"],
    );
    assert.equal(result.selectedCount, 3);
    assert.equal(result.textOnly, false);
  });

  it("does not retain usage between tasks and honors explicit exclusions", function () {
    const first = selectImages(images, {
      count: 1,
      random: function () {
        return 0;
      },
    });
    const second = selectImages(images, {
      count: 2,
      excludeImageIds: [first.images[0].id],
      random: function () {
        return 0;
      },
    });

    assert.equal(first.images[0].id, "one");
    assert.deepEqual(
      second.images.map(function (item) {
        return item.id;
      }),
      ["two", "three"],
    );
    assert.deepEqual(
      selectImages(images, {
        count: 1,
        random: function () {
          return 0;
        },
      }).images.map(function (item) {
        return item.id;
      }),
      ["one"],
    );
  });

  it("normalizes the default and rejects values outside the public range", function () {
    assert.equal(normalizeImageCount(undefined), DEFAULT_IMAGE_COUNT);
    assert.equal(normalizeImageCount(0), 0);
    assert.equal(normalizeImageCount(5), 5);
    ["1", -1, 6, 1.5].forEach(function (value) {
      assert.throws(
        function () {
          normalizeImageCount(value);
        },
        function (error) {
          return error.code === "CLIENT_IMAGE_COUNT_INVALID";
        },
      );
    });
  });
});
