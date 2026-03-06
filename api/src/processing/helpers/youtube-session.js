import { Agent } from "undici";
import * as cluster from "../../misc/cluster.js";

import { env } from "../../config.js";

const agent = new Agent();

let session;

function validateSession(data) {
  if (!data.potoken) {
    throw new Error("missing potoken");
  }

  if (!data.visitor_data) {
    throw new Error("missing visitor_data");
  }

  if (!data.updated) {
    throw new Error("missing updated timestamp");
  }

  if (data.potoken.length < 160) {
    console.warn("YouTube poToken unusually short");
  }
}

async function loadSession() {
  const url = new URL(env.ytSessionServer);
  url.pathname = "/token";

  const response = await fetch(url, { dispatcher: agent });
  const json = await response.json();

  validateSession(json);

  if (!session || session.updated < json.updated) {
    session = json;

    cluster.broadcast({
      youtube_session: json,
    });
  }
}

export function getYouTubeSession() {
  return session;
}

export function setup() {
  if (cluster.isPrimary) {
    loadSession();

    if (env.ytSessionReloadInterval > 0) {
      setInterval(loadSession, env.ytSessionReloadInterval * 1000);
    }
  }

  if (cluster.isWorker) {
    process.on("message", (msg) => {
      if (msg.youtube_session) {
        session = msg.youtube_session;
      }
    });
  }
}
