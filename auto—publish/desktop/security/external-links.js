"use strict";

const { loadEnabledPlatformDefinitions } = require("../../src/core/platforms");

const APPLICATION_EXTERNAL_HOSTS = Object.freeze(["mp.weixin.qq.com"]);

function createExternalLinkPolicy(options) {
  const values = options || {};
  const definitions = Array.isArray(values.definitions)
    ? values.definitions
    : loadEnabledPlatformDefinitions();
  const hosts = new Set(APPLICATION_EXTERNAL_HOSTS);
  definitions.forEach(function (definition) {
    (definition.externalHosts || []).forEach(function (host) {
      hosts.add(host);
    });
  });
  return Object.freeze({
    isAllowed(value) {
      try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const allowedHost = Array.from(hosts).some(function (host) {
          return hostname === host || hostname.endsWith(`.${host}`);
        });
        return (
          (url.protocol === "https:" || url.protocol === "http:") &&
          allowedHost &&
          !url.username &&
          !url.password &&
          !url.port
        );
      } catch (_) {
        return false;
      }
    },
    hosts: Object.freeze(Array.from(hosts).sort()),
  });
}

module.exports = { APPLICATION_EXTERNAL_HOSTS, createExternalLinkPolicy };
