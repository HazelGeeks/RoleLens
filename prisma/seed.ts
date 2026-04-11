import { PrismaClient, JobSource, JobStatus, RemoteType, EmploymentType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.jobPostingTag.deleteMany();
  await prisma.jobNote.deleteMany();
  await prisma.jobTag.deleteMany();
  await prisma.jobPosting.deleteMany();

  const tags = await Promise.all(
    ["react", "typescript", "nextjs", "frontend", "graphql", "canada"].map((name) =>
      prisma.jobTag.create({ data: { name } }),
    ),
  );

  const postings = await Promise.all([
    prisma.jobPosting.create({
      data: {
        source: JobSource.LINKEDIN,
        sourceUrl: "https://linkedin.com/jobs/view/123",
        company: "MapleStack",
        title: "Frontend Engineer",
        location: "Toronto, ON",
        remoteType: RemoteType.HYBRID,
        employmentType: EmploymentType.FULL_TIME,
        salaryMin: 100000,
        salaryMax: 135000,
        salaryCurrency: "CAD",
        seniority: "Mid",
        workAuthorizationNote: "Open to PGWP candidates already in Canada",
        descriptionRaw:
          "Build React and Next.js product surfaces, collaborate with design and backend, and own user-facing quality.",
        extractedSkills: ["React", "TypeScript", "Next.js", "Testing"],
        fitScore: 85,
        fitBreakdown: {
          react: 90,
          typescript: 88,
          frontend: 84,
          experience: 80,
          workAuthorizationRisk: 70,
          overall: 85,
        },
        status: JobStatus.READY_TO_APPLY,
        parserName: "manual",
        parserVersion: "1.0",
      },
    }),
    prisma.jobPosting.create({
      data: {
        source: JobSource.COMPANY_SITE,
        sourceUrl: "https://jobs.example.com/frontend",
        company: "Northbeam",
        title: "Senior Frontend Developer",
        location: "Vancouver, BC",
        remoteType: RemoteType.REMOTE,
        employmentType: EmploymentType.FULL_TIME,
        salaryMin: 125000,
        salaryMax: 155000,
        salaryCurrency: "CAD",
        seniority: "Senior",
        workAuthorizationNote: "Must be legally authorized to work in Canada",
        descriptionRaw:
          "Lead architecture for React and TypeScript apps, improve design systems, and mentor frontend engineers.",
        extractedSkills: ["React", "TypeScript", "Design System", "Mentorship"],
        fitScore: 79,
        fitBreakdown: {
          react: 86,
          typescript: 83,
          frontend: 88,
          experience: 70,
          workAuthorizationRisk: 65,
          overall: 79,
        },
        status: JobStatus.REVIEWING,
        parserName: "manual",
        parserVersion: "1.0",
      },
    }),
    prisma.jobPosting.create({
      data: {
        source: JobSource.INDEED,
        sourceUrl: "https://indeed.com/viewjob?jk=456",
        company: "Prairie Labs",
        title: "Junior Frontend Engineer",
        location: "Calgary, AB",
        remoteType: RemoteType.ONSITE,
        employmentType: EmploymentType.FULL_TIME,
        salaryMin: 70000,
        salaryMax: 90000,
        salaryCurrency: "CAD",
        seniority: "Junior",
        workAuthorizationNote: "Canadian PR/Citizen preferred",
        descriptionRaw:
          "Maintain UI features with React, support bug fixing, and collaborate on accessibility improvements.",
        extractedSkills: ["React", "JavaScript", "Accessibility", "CSS"],
        fitScore: 74,
        fitBreakdown: {
          react: 80,
          typescript: 62,
          frontend: 82,
          experience: 85,
          workAuthorizationRisk: 50,
          overall: 74,
        },
        status: JobStatus.SAVED,
        parserName: "manual",
        parserVersion: "1.0",
      },
    }),
  ]);

  await prisma.jobNote.createMany({
    data: [
      {
        jobPostingId: postings[0].id,
        content: "Looks aligned with current stack. Portfolio project relevance is high.",
      },
      {
        jobPostingId: postings[1].id,
        content: "Strong role but seniority may be slightly above current level.",
      },
      {
        jobPostingId: postings[2].id,
        content: "Could be a good backup application target this month.",
      },
    ],
  });

  await prisma.jobPostingTag.createMany({
    data: [
      { jobPostingId: postings[0].id, jobTagId: tags[0].id },
      { jobPostingId: postings[0].id, jobTagId: tags[1].id },
      { jobPostingId: postings[0].id, jobTagId: tags[2].id },
      { jobPostingId: postings[1].id, jobTagId: tags[0].id },
      { jobPostingId: postings[1].id, jobTagId: tags[3].id },
      { jobPostingId: postings[2].id, jobTagId: tags[5].id },
      { jobPostingId: postings[2].id, jobTagId: tags[3].id },
    ],
  });

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
