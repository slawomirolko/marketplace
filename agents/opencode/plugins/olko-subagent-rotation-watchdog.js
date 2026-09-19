// Rotates stalled OpenCode V1 subagent sessions before they consume a large
// context window. It is deliberately fail-open: a watchdog error never blocks
// the agent that is doing the work.

const TOKEN_THRESHOLD = 100_000
const LOOP_THRESHOLD = 3
const HANDOFF_TIMEOUT_MS = 120_000
const TOOL_OUTPUT_LIMIT = 2_000

const rotations = new Map()
const loops = new Map()

function textParts(parts) {
  return (parts || [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
}

function fingerprint(tool, args) {
  return `${tool}:${JSON.stringify(args ?? {})}`
}

function estimatedTokens(messages) {
  const serializable = messages.map(({ info, parts }) => ({
    role: info.role,
    agent: info.agent,
    parts: (parts || []).map((part) => {
      if (part.type === "text") return { type: "text", text: part.text }
      if (part.type === "tool") return { type: "tool", tool: part.tool, state: part.state }
      return { type: part.type, value: JSON.stringify(part).slice(0, TOOL_OUTPUT_LIMIT) }
    }),
  }))
  return Math.ceil(JSON.stringify(serializable).length / 4)
}

async function getSession(client, sessionID) {
  const response = await client.session.get({ path: { id: sessionID } })
  return response.data
}

async function getMessages(client, sessionID) {
  const response = await client.session.messages({ path: { id: sessionID } })
  return response.data || []
}

function latestAssistant(messages) {
  return [...messages].reverse().find((message) => message.info?.role === "assistant")
}

function latestUser(messages) {
  return [...messages].reverse().find((entry) => entry.info?.role === "user")
}

function originalTask(messages) {
  const message = messages.find((entry) => entry.info?.role === "user")
  return message ? textParts(message.parts) : ""
}

function handoffPrompt(reason, tokens) {
  return [
    "WATCHDOG ROTATION REQUIRED.",
    "Do not begin another task, tool call, or investigation.",
    "Return only a HANDOFF with these headings:",
    "OBJECTIVE, COMPLETED, CURRENT STATE, CHANGED FILES, TESTS, BLOCKERS, NEXT STEP.",
    `Reason: ${reason}. Estimated context: ${tokens} tokens.`,
  ].join("\n")
}

async function requestRotation(client, sessionID, reason, measuredTokens) {
  if (rotations.has(sessionID)) return

  const session = await getSession(client, sessionID)
  if (!session?.parentID) return

  const messages = await getMessages(client, sessionID)
  const tokens = measuredTokens ?? estimatedTokens(messages)
  const user = latestUser(messages)
  rotations.set(sessionID, {
    user,
    parentID: session.parentID,
    originalTask: originalTask(messages),
    reason,
    tokens,
    timeout: setTimeout(() => forceRotate(client, sessionID), HANDOFF_TIMEOUT_MS),
  })

  await client.session.promptAsync({
    path: { id: sessionID },
    body: {
      agent: user?.info?.agent,
      model: user?.info?.model,
      parts: [{ type: "text", text: handoffPrompt(reason, tokens) }],
    },
  })
}

async function forceRotate(client, sessionID) {
  if (!rotations.has(sessionID)) return
  await finishRotation(client, sessionID, "timeout")
}

async function finishRotation(client, sessionID, completion) {
  const rotation = rotations.get(sessionID)
  if (!rotation) return
  rotations.delete(sessionID)
  clearTimeout(rotation.timeout)

  const messages = await getMessages(client, sessionID)
  const handoff = textParts(latestAssistant(messages)?.parts)
  const replacement = await client.session.create({
    body: {
      parentID: rotation.parentID,
      title: `Continuation of ${sessionID}`,
    },
  })
  const replacementID = replacement.data?.id
  if (!replacementID) throw new Error("Watchdog could not create replacement subagent session")

  const continuation = [
    "You are a replacement subagent. Continue the same task without repeating completed work.",
    `Original task:\n${rotation.originalTask || "Recover the task from the handoff."}`,
    `Handoff from the previous subagent (${completion}; ${rotation.reason}; ${rotation.tokens} estimated tokens):\n${handoff || "No handoff was returned; inspect the repository and continue safely."}`,
  ].join("\n\n")
  await client.session.promptAsync({
    path: { id: replacementID },
    body: {
      agent: rotation.user?.info?.agent,
      model: rotation.user?.info?.model,
      parts: [{ type: "text", text: continuation }],
    },
  })

  await client.session.abort({ path: { id: sessionID } })
  await client.session.promptAsync({
    path: { id: rotation.parentID },
    body: {
      parts: [{
        type: "text",
        text: `Watchdog rotated child ${sessionID} into ${replacementID}. Do not continue the old child; use the replacement's handoff and result.`,
      }],
    },
  })
}

async function observeContext(client, sessionID) {
  const session = await getSession(client, sessionID)
  if (!session?.parentID || rotations.has(sessionID)) return
  const tokens = estimatedTokens(await getMessages(client, sessionID))
  if (tokens >= TOKEN_THRESHOLD) await requestRotation(client, sessionID, "context threshold")
}

export const SubagentRotationWatchdog = async ({ client }) => ({
  "tool.execute.after": async (input) => {
    try {
      const key = input.sessionID
      const next = fingerprint(input.tool, input.args)
      const previous = loops.get(key)
      const count = previous?.fingerprint === next ? previous.count + 1 : 1
      loops.set(key, { fingerprint: next, count })
      if (count >= LOOP_THRESHOLD) await requestRotation(client, key, `repeated ${input.tool} call`)
      else await observeContext(client, key)
    } catch {
      // A watchdog must never prevent the active agent from completing work.
    }
  },
  event: async ({ event }) => {
    try {
      if (event.type === "message.updated" && event.properties.info.role === "assistant") {
        const { sessionID, tokens } = event.properties.info
        if (tokens.input >= TOKEN_THRESHOLD) {
          await requestRotation(client, sessionID, "context threshold", tokens.input)
        }
      }
      if (event.type === "session.idle" && rotations.has(event.properties.sessionID)) {
        await finishRotation(client, event.properties.sessionID, "handoff received")
      }
      if (event.type === "session.compacted") loops.delete(event.properties.sessionID)
    } catch {
      // Keep the plugin fail-open for OpenCode API incompatibilities.
    }
  },
})
