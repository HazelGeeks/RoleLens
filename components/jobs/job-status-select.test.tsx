// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JobStatusSelect } from "./job-status-select";

afterEach(cleanup);
const job = {
  id: "job-1",
  title: "Engineer",
  company: "Acme",
  status: "NONE" as const,
};

it.each(["PLANNED", "EXPIRED"])(
  "saves %s directly from the selector",
  async (status) => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<JobStatusSelect job={job} onSave={onSave} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: status },
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("job-1", status));
    expect(screen.getByRole("option", { name: "Applied" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "On hold" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Not applying" })).toBeTruthy();
  },
);

it("keeps the saved status and allows retry after a failed save", async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection failed"))
    .mockResolvedValue(undefined);
  render(<JobStatusSelect job={job} onSave={onSave} />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "ON_HOLD" },
  });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Connection failed",
  );
  expect(screen.getByRole("combobox")).toHaveProperty("value", "NONE");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "ON_HOLD" },
  });
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
