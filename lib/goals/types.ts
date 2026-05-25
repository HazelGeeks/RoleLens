export type GoalFollowUp = {
  id: string;
  goalId: string;
  userId: string;
  note: string;
  createdAt: string;
  nextActionDate?: string;
};

export type Goal = {
  id: string;
  userId: string;
  company: string;
  targetRole?: string;
  motivation?: string;
  createdAt: string;
  updatedAt: string;
  followUps: GoalFollowUp[];
};

export type CreateGoalInput = {
  company: string;
  targetRole?: string;
  motivation?: string;
};

export type CreateGoalFollowUpInput = {
  note: string;
  nextActionDate?: string;
};
