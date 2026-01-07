import { test, expect, describe, mock } from "bun:test"

describe("Plugin Loading Performance", () => {
  test("plugin loads quickly (< 100ms)", async () => {
    const start = performance.now()
    
    // Dynamic import to measure cold load time
    const { ChatRecallPlugin } = await import("./index")
    
    const importTime = performance.now() - start
    console.log(`Import time: ${importTime.toFixed(2)}ms`)
    
    expect(importTime).toBeLessThan(100)
  })

  test("plugin initialization is fast (< 50ms)", async () => {
    const { ChatRecallPlugin } = await import("./index")
    
    // Mock the plugin input
    const mockInput = {
      client: {
        session: {
          messages: mock(() => Promise.resolve({ data: [] })),
          get: mock(() => Promise.resolve({ data: null })),
        },
      },
      project: { id: "test-project" },
      directory: "/test/dir",
      worktree: "/test/worktree",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    }

    const start = performance.now()
    const hooks = await ChatRecallPlugin(mockInput as any)
    const initTime = performance.now() - start
    
    console.log(`Init time: ${initTime.toFixed(2)}ms`)
    
    expect(initTime).toBeLessThan(50)
    expect(hooks.tool).toBeDefined()
    expect(hooks.event).toBeDefined()
    expect(hooks["experimental.session.compacting"]).toBeDefined()
  })

  test("tools are accessible", async () => {
    const { ChatRecallPlugin } = await import("./index")
    
    const mockInput = {
      client: {
        session: {
          messages: mock(() => Promise.resolve({ data: [] })),
          get: mock(() => Promise.resolve({ data: null })),
        },
      },
      project: { id: "test-project" },
      directory: "/test/dir",
      worktree: "/test/worktree",
      serverUrl: new URL("http://localhost:3000"),
      $: {} as any,
    }

    const hooks = await ChatRecallPlugin(mockInput as any)
    
    expect(hooks.tool).toHaveProperty("list_transcripts")
    expect(hooks.tool).toHaveProperty("recall_transcript")
  })
})

describe("Storage Module", () => {
  test("storage module loads quickly", async () => {
    const start = performance.now()
    const storage = await import("./storage")
    const loadTime = performance.now() - start
    
    console.log(`Storage module load time: ${loadTime.toFixed(2)}ms`)
    
    expect(loadTime).toBeLessThan(50)
    expect(storage.saveTranscript).toBeDefined()
    expect(storage.loadTranscript).toBeDefined()
    expect(storage.listTranscripts).toBeDefined()
  })
})

describe("Formatter Module", () => {
  test("formatter module loads quickly", async () => {
    const start = performance.now()
    const formatter = await import("./formatter")
    const loadTime = performance.now() - start
    
    console.log(`Formatter module load time: ${loadTime.toFixed(2)}ms`)
    
    expect(loadTime).toBeLessThan(50)
    expect(formatter.buildTranscript).toBeDefined()
    expect(formatter.formatMessagesToMarkdown).toBeDefined()
  })
})

describe("Search Module", () => {
  test("search module loads quickly", async () => {
    const start = performance.now()
    const search = await import("./search")
    const loadTime = performance.now() - start
    
    console.log(`Search module load time: ${loadTime.toFixed(2)}ms`)
    
    expect(loadTime).toBeLessThan(50)
    expect(search.searchTranscripts).toBeDefined()
  })
})

describe("Tools Module", () => {
  test("tools module loads quickly", async () => {
    const start = performance.now()
    const tools = await import("./tools")
    const loadTime = performance.now() - start
    
    console.log(`Tools module load time: ${loadTime.toFixed(2)}ms`)
    
    expect(loadTime).toBeLessThan(50)
    expect(tools.tools.list_transcripts).toBeDefined()
    expect(tools.tools.recall_transcript).toBeDefined()
  })
})
