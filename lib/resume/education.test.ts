import { describe, expect, it } from "vitest";
import {
  emptyEducationEntry,
  emptyResumeEntry,
  emptyResumeProfile,
  resumeProfileSchema,
} from "./profile";
import {
  formatEducationDate,
  formatEducationSummary,
  getEducationDegreeChoice,
} from "./education";

describe("education records", () => {
  it("loads legacy records without losing the original degree, location, notes or dates", () => {
    const legacy = {
      ...emptyResumeEntry(),
      title: "Bachelor of Business Administration",
      organization: "Example University",
      location: "Seoul",
      details: "Honors",
      startDate: "2018-03",
      endDate: "2020-02",
    };
    const profile = resumeProfileSchema.parse({
      ...emptyResumeProfile(),
      education: [legacy],
    });
    expect(profile.education[0]).toEqual(legacy);
    expect(formatEducationSummary(profile.education[0])).toBe(
      "Bachelor of Business Administration",
    );
    expect(formatEducationDate(profile.education[0])).toBe("2020.02");
    expect(profile.education[0].academicStatus).toBeUndefined();
  });
  it("combines separate fields and only prints transfer admission", () => {
    const entry = {
      ...emptyEducationEntry(),
      major: "Computer Science",
      degree: "BSc",
      academicStatus: "graduated" as const,
      admissionType: "transfer" as const,
    };
    expect(formatEducationSummary(entry)).toBe(
      "Computer Science · BSc · Transfer · Graduated",
    );
    expect(formatEducationSummary({ ...entry, admissionType: "regular" })).toBe(
      "Computer Science · BSc · Graduated",
    );
  });
  it("respects an explicitly cleared degree instead of reviving legacy text", () => {
    expect(
      formatEducationSummary({
        ...emptyEducationEntry(),
        title: "Old degree",
        degree: "",
      }),
    ).toBe("");
  });
  it("supports month, year, range and hidden dates without duration annotations", () => {
    const entry = {
      ...emptyEducationEntry(),
      startDate: "2018-03",
      endDate: "2020-02",
    };
    expect(formatEducationDate(entry)).toBe("2020.02");
    expect(formatEducationDate({ ...entry, dateDisplay: "end-year" })).toBe(
      "2020",
    );
    expect(formatEducationDate({ ...entry, dateDisplay: "range" })).toBe(
      "2018-03 – 2020-02",
    );
    expect(formatEducationDate({ ...entry, dateDisplay: "hidden" })).toBe("");
  });
  it("does not treat missing completion dates as continued enrollment", () => {
    const entry = {
      ...emptyEducationEntry(),
      startDate: "2018-03",
      dateDisplay: "range" as const,
    };
    expect(formatEducationDate(entry)).toBe("2018-03");
    for (const academicStatus of ["withdrawn", "transferred-out"] as const) {
      const profile = resumeProfileSchema.parse({
        ...emptyResumeProfile(),
        education: [{ ...entry, academicStatus }],
      });
      expect(formatEducationDate(profile.education[0])).toBe("2018-03");
    }
    expect(
      formatEducationSummary({ ...entry, academicStatus: "transferred-out" }),
    ).toBe("Transferred out");
    expect(formatEducationDate({ ...entry, academicStatus: "enrolled" })).toBe(
      "2018-03 – Present",
    );
    expect(
      formatEducationDate({
        ...entry,
        academicStatus: "expected",
        dateDisplay: "end-month",
      }),
    ).toBe("");
  });
  it("validates new statuses, date order, field lengths and duplicate IDs", () => {
    const entry = emptyEducationEntry();
    for (const education of [
      [{ ...entry, academicStatus: "invalid" }],
      [{ ...entry, admissionType: "invalid" }],
      [{ ...entry, dateDisplay: "invalid" }],
      [{ ...entry, degreeLevel: "invalid" }],
      [{ ...entry, majorType: "invalid" }],
      [{ ...entry, additionalMajor: "x".repeat(201) }],
      [{ ...entry, major: "x".repeat(201) }],
      [{ ...entry, startDate: "2021-03", endDate: "2020-02" }],
      [entry, entry],
    ])
      expect(
        resumeProfileSchema.safeParse({ ...emptyResumeProfile(), education })
          .success,
      ).toBe(false);
  });
});

it("prints bachelor's, master's and doctorate levels without inferring graduation", () => {
  for (const [degreeLevel, expected] of [
    ["bachelor", "Bachelor's"],
    ["master", "Master's"],
    ["doctorate", "Doctorate"],
  ] as const) {
    expect(
      formatEducationSummary({ ...emptyEducationEntry(), degreeLevel }),
    ).toBe(expected);
  }
  expect(
    formatEducationSummary({
      ...emptyEducationEntry(),
      degreeLevel: "master",
      degree: "MBA",
    }),
  ).toBe("Master's");
});
it("distinguishes double majors and minors, retaining hidden second fields", () => {
  const entry = {
    ...emptyEducationEntry(),
    major: "Computer Science",
    additionalMajor: "Economics",
    degreeLevel: "bachelor" as const,
  };
  expect(formatEducationSummary({ ...entry, majorType: "double" })).toBe(
    "Computer Science & Economics (Double major) · Bachelor's",
  );
  expect(formatEducationSummary({ ...entry, majorType: "minor" })).toBe(
    "Computer Science · Minor in Economics · Bachelor's",
  );
  expect(formatEducationSummary({ ...entry, majorType: "single" })).toBe(
    "Computer Science · Bachelor's",
  );
  expect(
    formatEducationSummary({
      ...entry,
      majorType: "double",
      additionalMajor: "",
    }),
  ).toBe("Computer Science (Double major) · Bachelor's");
});

it("uses a single degree choice and preserves legacy custom titles", () => {
  const legacy = { ...emptyResumeEntry(), title: "MBA" };
  expect(getEducationDegreeChoice(legacy)).toBe("other");
  expect(formatEducationSummary(legacy)).toBe("MBA");
  expect(
    formatEducationSummary({
      ...legacy,
      degreeLevel: "master",
      degree: "Master's",
    }),
  ).toBe("Master's");
  expect(formatEducationSummary({ ...legacy, degreeLevel: "other" })).toBe(
    "MBA",
  );
  expect(formatEducationSummary({ ...legacy, degreeLevel: "" })).toBe("");
  expect(formatEducationSummary({ ...legacy, major: "MBA" })).toBe("MBA");
});

it("prints GPA with the chosen scale and accepts existing profiles without GPA", () => {
  for (const [gpa, gpaScale] of [
    ["3.8", "4.5"],
    ["3.8", "4.0"],
    ["3.8", "4.3"],
    ["90", "100"],
    ["0", "4.0"],
  ]) {
    const entry = { ...emptyEducationEntry(), gpa, gpaScale };
    expect(
      resumeProfileSchema.safeParse({
        ...emptyResumeProfile(),
        education: [entry],
      }).success,
    ).toBe(true);
    expect(formatEducationSummary(entry)).toBe(`GPA ${gpa}/${gpaScale}`);
  }
  expect(formatEducationSummary(emptyEducationEntry())).toBe("");
});

it("rejects invalid, incomplete and over-scale GPAs", () => {
  for (const [gpa, gpaScale] of [
    ["5", "4.5"],
    ["3.8", ""],
    ["", "4.0"],
    ["0", "0"],
    ["-1", "4"],
    ["3.8", "101"],
    ["NaN", "4"],
    ["3.8", "-4"],
  ]) {
    expect(
      resumeProfileSchema.safeParse({
        ...emptyResumeProfile(),
        education: [{ ...emptyEducationEntry(), gpa, gpaScale }],
      }).success,
    ).toBe(false);
  }
});
