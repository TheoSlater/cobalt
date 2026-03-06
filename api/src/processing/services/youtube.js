import HLS from "hls-parser";
import { fetch } from "undici";
import { Innertube, Session } from "youtubei.js";

import { env, genericUserAgent } from "../../config.js";
import { getCookie } from "../cookie/manager.js";
import { getYouTubeSession } from "../helpers/youtube-session.js";

const PLAYER_REFRESH_PERIOD = 1000 * 60 * 15;

let innertube;
let lastRefreshedAt;

const STREAM_HEADERS = {
  "User-Agent": genericUserAgent,
  Origin: "https://www.youtube.com",
  Referer: "https://www.youtube.com/",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

function createFetch(dispatcher) {
  return (input, init = {}) =>
    fetch(input, {
      ...init,
      dispatcher,
      headers: {
        ...STREAM_HEADERS,
        ...(init.headers || {}),
      },
    });
}

async function cloneInnertube(customFetch, useSession, forceRefresh = false) {
  const shouldRefresh =
    forceRefresh ||
    !lastRefreshedAt ||
    Date.now() - lastRefreshedAt > PLAYER_REFRESH_PERIOD;

  const rawCookie = getCookie("youtube");
  const cookie = rawCookie?.toString();

  const sessionTokens = getYouTubeSession();
  const hasSessionTokens = Boolean(sessionTokens?.potoken && sessionTokens?.visitor_data);
  const retrieve_player = true;

  if (useSession && env.ytSessionServer && !hasSessionTokens) {
    useSession = false;
  }

  if (!innertube || shouldRefresh) {
    innertube = await Innertube.create({
      fetch: customFetch,
      retrieve_player,
      cookie,
      po_token: useSession ? sessionTokens?.potoken : undefined,
      visitor_data: useSession ? sessionTokens?.visitor_data : undefined,
    });

    lastRefreshedAt = Date.now();
  }

  const session = new Session(
    innertube.session.context,
    innertube.session.api_key,
    innertube.session.api_version,
    innertube.session.account_index,
    innertube.session.config_data,
    innertube.session.player,
    cookie,
    customFetch ?? innertube.session.http.fetch,
    innertube.session.cache,
    sessionTokens?.potoken,
  );

  return new Innertube(session);
}

async function getBasicInfoWithFallback(yt, id, preferredClient) {
  const clients = [
    preferredClient,
    "WEB",
    "WEB_EMBEDDED",
    "IOS",
    "ANDROID",
    "TVHTML5",
  ].filter(Boolean);

  let info;
  let usedClient;

  for (const client of clients) {
    try {
      info = await yt.getBasicInfo(id, { client });
      usedClient = client;
      break;
    } catch {}
  }

  if (!info) {
    throw new Error("info_fetch_failed");
  }

  return { info, usedClient };
}

function decipherURL(format, player) {
  if (format?.decipher && player) {
    try {
      return format.decipher(player);
    } catch {}
  }

  return format?.url;
}

function pickFormats(streaming) {
  const formats = [];

  if (streaming?.adaptive_formats?.length) {
    formats.push(...streaming.adaptive_formats);
  }

  if (streaming?.formats?.length) {
    formats.push(...streaming.formats);
  }

  return formats;
}

function pickFirstMedia(formats) {
  let video;
  let audio;
  let muxed;

  for (const f of formats) {
    if (f.has_video && f.has_audio && !muxed) muxed = f;
    if (f.has_video && !video) video = f;
    if (f.has_audio && !audio) audio = f;

    if (video && audio && muxed) break;
  }

  return { video, audio, muxed };
}

function buildStream(url) {
  return url;
}

export default async function (o) {
  const fetcher = createFetch(o.dispatcher);

  let yt = await cloneInnertube(fetcher, Boolean(env.ytSessionServer));

  const { info, usedClient } = await getBasicInfoWithFallback(
    yt,
    o.id,
    o.innertubeClient || "IOS",
  );

  const basic = info.basic_info;
  const streaming = info.streaming_data;

  if (!streaming) {
    return { error: "youtube.no_streams" };
  }

  const formats = pickFormats(streaming);

  if (!formats?.length) {
    return { error: "youtube.no_matching_format" };
  }

  const { video, audio, muxed } = pickFirstMedia(formats);

  let videoURL;
  let audioURL;
  let muxedURL;

  if (muxed) {
    muxedURL = decipherURL(muxed, yt.session.player);
  } else {
    if (!video || !audio) {
      return { error: "youtube.no_matching_format" };
    }

    videoURL = decipherURL(video, yt.session.player);
    audioURL = decipherURL(audio, yt.session.player);
  }

  if ((!muxedURL && (!videoURL || !audioURL)) || (muxed && !muxedURL)) {
    yt = await cloneInnertube(fetcher, Boolean(env.ytSessionServer), true);

    if (muxed) {
      muxedURL = decipherURL(muxed, yt.session.player);
    } else {
      videoURL = decipherURL(video, yt.session.player);
      audioURL = decipherURL(audio, yt.session.player);
    }
  }

  if ((!muxedURL && (!videoURL || !audioURL)) || (muxed && !muxedURL)) {
    return { error: "youtube.decipher" };
  }

  return {
    type: muxed ? "proxy" : "merge",
    urls: muxed ? buildStream(muxedURL) : [buildStream(videoURL), buildStream(audioURL)],
    headers: STREAM_HEADERS,
    filenameAttributes: {
      service: "youtube",
      id: o.id,
      title: basic.title,
      author: basic.author,
      resolution: `${(muxed ?? video).width}x${(muxed ?? video).height}`,
      qualityLabel: `${(muxed ?? video).height}p`,
      extension: "mp4",
    },
    fileMetadata: {
      title: basic.title,
      artist: basic.author,
    },
    originalRequest: {
      ...o,
      innertubeClient: usedClient,
    },
  };
}
