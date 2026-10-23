// Inspect only the offscreen page in the isolated browser profile used by tests.
// Playwright does not expose offscreen documents as normal pages.
async function evaluateOffscreen(harness, fn, arg) {
  const cdp = await harness.context.browser().newBrowserCDPSession();
  let sessionId;
  try {
    const targets = await cdp.send("Target.getTargets");
    const target = targets.targetInfos.find(entry => entry.url === new URL("offscreen/eq.html", harness.worker.url()).href);
    if (!target) throw new Error("No EQ offscreen document in the test browser");
    ({ sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: false }));
    let timer;
    let receive;
    try {
      const result = new Promise((resolve, reject) => {
        receive = event => {
          if (event.sessionId !== sessionId) return;
          const response = JSON.parse(event.message);
          if (response.id !== 1) return;
          if (response.error) reject(new Error(response.error.message));
          else if (response.result?.exceptionDetails) reject(new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text));
          else resolve(response.result?.result?.value);
        };
        cdp.on("Target.receivedMessageFromTarget", receive);
        timer = setTimeout(() => reject(new Error("EQ test page did not reply")), 10000);
      });
      await cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({
        id: 1, method: "Runtime.evaluate", params: {
          expression: `(${fn.toString()})(${JSON.stringify(arg) ?? "undefined"})`, awaitPromise: true, returnByValue: true
        }
      }) });
      return await result;
    } finally {
      clearTimeout(timer);
      if (receive) cdp.off("Target.receivedMessageFromTarget", receive);
    }
  } finally {
    if (sessionId) await cdp.send("Target.detachFromTarget", { sessionId }).catch(() => {});
    await cdp.detach();
  }
}

module.exports = { evaluateOffscreen };
