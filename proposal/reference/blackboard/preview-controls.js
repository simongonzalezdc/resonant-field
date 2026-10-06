(() => {
  function initialize() {
  const fixtureButtons = [...document.querySelectorAll("[data-fixture]")];
  const status = document.getElementById("preview-status");
  const sendButton = document.getElementById("bb-send-to-augmentor");
  const webButton = document.querySelector('.bb-mode-tabs button[data-mode="embed"]');
  const clearButton = document.getElementById("bb-clear");
  const sourceTabs = [...document.querySelectorAll(".bb-mode-tabs button")];

  sendButton.disabled = true;
  sendButton.title = "Host-only action unavailable in this local preview";
  webButton.disabled = true;
  webButton.title = "Remote web embeds are disabled in this local preview";

  const localImage = "./preview-image.svg";

  const fixtures = {
    canvas: {
      command: "draw",
      payload: { shapes: [
        { type: "text", x: 72, y: 78, text: "A CONVERSATION BECOMES A VISUAL PLAN", fontSize: 18, align: "left", color: "#a3a3a3" },
        { type: "rect", x: 80, y: 150, w: 190, h: 110, label: "Question", color: "#4db8ff", fill: true },
        { type: "arrow", x1: 275, y1: 205, x2: 360, y2: 205, label: "organize" },
        { type: "rect", x: 370, y: 150, w: 190, h: 110, label: "Draft", color: "#24d18f", fill: true },
        { type: "arrow", x1: 565, y1: 205, x2: 650, y2: 205, label: "review" },
        { type: "rect", x: 660, y: 150, w: 190, h: 110, label: "Decision", color: "#9b6dff", fill: true },
        { type: "text", x: 82, y: 315, text: "Example only · drawn by Blackboard's canvas renderer", fontSize: 14, align: "left", color: "#737373" }
      ] }
    },
    document: {
      command: "document",
      payload: { markdown: "# Project snapshot\n\nBlackboard is a **visual display surface** for material an assistant prepares during a conversation.\n\n## A small example\n\nA discussion can become a document with structure, emphasis, and clear next steps.\n\n- Keep the goal visible\n- Gather the key information\n- Make the next action easy to find\n\n> This is a local sample, not connected to an assistant or extension host.\n\n---\n\n*Choose another example above, or switch modes using the original toolbar.*" }
    },
    table: {
      command: "table",
      payload: { title: "Example project checklist", headers: ["Item", "Status", "Next step"], rows: [
        ["Question", "Ready", "Confirm the goal"],
        ["Draft", "In progress", "Review the outline"],
        ["Decision", "Pending", "Choose a direction"]
      ] }
    },
    image: {
      command: "image",
      payload: { src: localImage, alt: "A simple locally embedded illustration with a green circle and smile", annotations: [
        { type: "label", x: 385, y: 120, text: "LOCAL SAMPLE", color: "#ffd166", fontSize: 22 }
      ] }
    }
  };

  function setSelection(selected, message) {
    fixtureButtons.forEach((button) => button.setAttribute("aria-pressed", String(button === selected)));
    status.textContent = message;
  }

  function showFixture(button) {
    const fixture = fixtures[button.dataset.fixture];
    if (!fixture || !window.__resonantBlackboardTest) return;
    window.__resonantBlackboardTest.send(fixture.command, fixture.payload);
    setSelection(button, `Showing local ${button.dataset.fixture} example. Use the Blackboard toolbar to switch modes.`);
  }

  fixtureButtons.forEach((button) => button.addEventListener("click", () => showFixture(button)));
  sourceTabs.forEach((button) => button.addEventListener("click", () => {
    fixtureButtons.forEach((item) => item.setAttribute("aria-pressed", "false"));
    if (button.dataset.mode !== "embed") status.textContent = `${button.textContent} mode opened. Choose an example above to load local content.`;
  }));
  clearButton.addEventListener("click", () => {
    fixtureButtons.forEach((item) => item.setAttribute("aria-pressed", "false"));
    status.textContent = "Blackboard cleared. Choose a local example above to display content.";
  });

  const initial = fixtureButtons.find((button) => button.dataset.fixture === "canvas");
  showFixture(initial);
  }
  window.addEventListener("blackboard:preview-ready", initialize, { once: true });
  if (window.__resonantBlackboardTest) initialize();
})();
