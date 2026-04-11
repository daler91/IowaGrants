import { describe, it, expect } from "vitest";
import { drawerPanelClass, drawerContainerClass } from "../Drawer";

describe("drawerPanelClass", () => {
  it("adds right-side layout", () => {
    const cls = drawerPanelClass("right");
    expect(cls).toContain("ml-auto");
    expect(cls).toContain("border-l");
  });

  it("adds left-side layout", () => {
    const cls = drawerPanelClass("left");
    expect(cls).toContain("border-r");
  });

  it("adds bottom-sheet layout", () => {
    const cls = drawerPanelClass("bottom");
    expect(cls).toContain("border-t");
    expect(cls).toContain("rounded-t-2xl");
  });
});

describe("drawerContainerClass", () => {
  it("justifies end for right drawer", () => {
    expect(drawerContainerClass("right")).toContain("justify-end");
  });
  it("justifies start for left drawer", () => {
    expect(drawerContainerClass("left")).toContain("justify-start");
  });
  it("aligns items-end for bottom sheet", () => {
    expect(drawerContainerClass("bottom")).toContain("items-end");
  });
});
