import { screen } from "@testing-library/react";

/** The drawn node (`selector`: its box class) whose title is `title`. */
export function nodeTitled(title: string, selector = ".card, .group"): HTMLElement {
  const box = screen.getByText(title, { selector: ".card-title" }).closest<HTMLElement>(selector);
  if (!box) {
    throw new Error(`no node titled ${title}`);
  }
  return box;
}

/** The agent or script card titled `title`. */
export function card(title: string): HTMLElement {
  return nodeTitled(title, ".card");
}

/** The expanded team or call box titled `title`. */
export function group(title: string): HTMLElement {
  return nodeTitled(title, ".group");
}

/** Waits until the card titled `title` is drawn, for pages that load their data first. */
export async function findCard(title: string): Promise<HTMLElement> {
  await screen.findByText(title, { selector: ".card-title" });
  return card(title);
}
