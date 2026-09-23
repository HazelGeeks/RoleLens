import { describe, expect, it } from "vitest";
import { parseResumePdfText } from "./pdf-import";

const ENGLISH_RESUME = `Alex Kim
Senior Frontend Engineer
alex.kim@example.com | 010-1234-5678 | Seoul, South Korea | github.com/alexkim
Professional Summary
8 years building web products with React and TypeScript.
Experience
Senior Frontend Engineer @ Example Corp (Seoul) 2021.03 - Present
- Led migration to React Server Components
- Improved LCP by 40 percent in 2023
Frontend Engineer, Startup Inc 2018-01 ~ 2021.02
- Shipped design system used by 5 teams
Education
Example University, Computer Science
Bachelor of Science, GPA 3.8/4.5, 2018
Skills
React, TypeScript, Next.js`;

const KOREAN_RESUME = `홍길동
프론트엔드 개발자
hong@example.com | 010-9876-5432 | 서울시 강남구 | portfolio.example.com
요약
5년차 웹 개발자입니다.
경력
시니어 프론트엔드 개발자 @ 테스트 주식회사 2020년 3월 - 현재
- 성능 개선으로 이탈률 20% 감소
학력
테스트대학교 컴퓨터공학과
학사, GPA 3.9/4.5, 2020년 2월
기술
React, TypeScript`;

describe("parseResumePdfText", () => {
  it("parses an English resume into profile fields and entries", () => {
    const profile = parseResumePdfText(ENGLISH_RESUME);
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("Alex Kim");
    expect(profile?.headline).toBe("Senior Frontend Engineer");
    expect(profile?.email).toBe("alex.kim@example.com");
    expect(profile?.phone).toBe("010-1234-5678");
    expect(profile?.location).toBe("Seoul, South Korea");
    expect(profile?.website).toContain("github.com/alexkim");
    expect(profile?.summary).toContain("8 years building web products");
    expect(profile?.experience).toHaveLength(2);
    expect(profile?.experience[0]).toMatchObject({
      title: "Senior Frontend Engineer",
      organization: "Example Corp",
      location: "Seoul",
      startDate: "2021-03",
      endDate: "",
    });
    expect(profile?.experience[0].details).toContain(
      "Led migration to React Server Components",
    );
    // A year inside a bullet must not split the entry.
    expect(profile?.experience[0].details).toContain("in 2023");
    expect(profile?.experience[1]).toMatchObject({
      title: "Frontend Engineer",
      organization: "Startup Inc",
      startDate: "2018-01",
      endDate: "2021-02",
    });
    expect(profile?.education).toHaveLength(1);
    expect(profile?.education[0].organization).toBe("Example University");
    expect(profile?.education[0].major).toBe("Computer Science");
    expect(profile?.education[0].degreeLevel).toBe("bachelor");
    expect(profile?.education[0].gpa).toBe("3.8");
    expect(profile?.education[0].gpaScale).toBe("4.5");
    expect(profile?.skills).toContain("React, TypeScript, Next.js");
  });

  it("parses a Korean resume with Korean dates", () => {
    const profile = parseResumePdfText(KOREAN_RESUME);
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("홍길동");
    expect(profile?.email).toBe("hong@example.com");
    expect(profile?.experience).toHaveLength(1);
    expect(profile?.experience[0]).toMatchObject({
      organization: "테스트 주식회사",
      startDate: "2020-03",
      endDate: "",
    });
    expect(profile?.education[0].organization).toBe("테스트대학교");
    expect(profile?.education[0].gpa).toBe("3.9");
  });

  it("returns null for empty or unrecognizable text", () => {
    expect(parseResumePdfText("")).toBeNull();
    expect(parseResumePdfText("   \n  ")).toBeNull();
    expect(parseResumePdfText(`${"x".repeat(150)}`)).toBeNull();
  });

  it("ignores invalid GPA values instead of failing validation", () => {
    const profile = parseResumePdfText(
      "Kim Lee\nkim@example.com\nEducation\nSome School\nGPA 9.9/4.5, 2020",
    );
    expect(profile?.education[0].gpa ?? "").toBe("");
  });
});
