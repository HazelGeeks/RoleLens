"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthRequiredModal } from "@/components/auth/auth-required-modal";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPredictedInterviewQuestions,
  evaluateSpokenAnswer,
  type InterviewFeedback,
  type InterviewQuestion,
} from "@/lib/interview-practice";
import { useLiveLocalJobs } from "@/lib/use-live-local-jobs";

type InterviewAttempt = {
  id: string;
  questionId: string;
  questionPrompt: string;
  transcript: string;
  createdAt: string;
  durationSeconds: number;
  feedback: InterviewFeedback;
};

type InterviewWorkspaceDraft = {
  manualQuestions: InterviewQuestion[];
  selectedQuestionId: string | null;
  answerDraft: string;
  attempts: InterviewAttempt[];
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

function isInterviewFeedbackLevel(
  value: unknown,
): value is InterviewFeedback["level"] {
  return value === "Needs Work" || value === "Good" || value === "Strong";
}

function getInterviewDraftStorageKey(userId: string) {
  return `rolelens.interview.practice.${userId}`;
}

function normalizeTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatAttemptDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

function resolveSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;

  const runtimeWindow = window as Window & {
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    SpeechRecognition?: SpeechRecognitionConstructorLike;
  };

  return (
    runtimeWindow.SpeechRecognition ||
    runtimeWindow.webkitSpeechRecognition ||
    null
  );
}

export function InterviewPageClient() {
  const { status, user } = useAuth();
  const { jobs } = useLiveLocalJobs();
  const [manualQuestionInput, setManualQuestionInput] = useState("");
  const [manualQuestions, setManualQuestions] = useState<InterviewQuestion[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [attempts, setAttempts] = useState<InterviewAttempt[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const answerDraftRef = useRef("");

  const candidateJobs = useMemo(
    () => jobs.filter((job) => job.status !== "ARCHIVE"),
    [jobs],
  );

  const predictedQuestions = useMemo(
    () => buildPredictedInterviewQuestions(candidateJobs, 18),
    [candidateJobs],
  );

  const allQuestions = useMemo(
    () => [...manualQuestions, ...predictedQuestions],
    [manualQuestions, predictedQuestions],
  );

  const selectedQuestion = useMemo(
    () =>
      allQuestions.find((question) => question.id === selectedQuestionId) || null,
    [allQuestions, selectedQuestionId],
  );

  const selectedQuestionAttempts = useMemo(() => {
    if (!selectedQuestion) return [];
    return attempts.filter((attempt) => attempt.questionId === selectedQuestion.id);
  }, [attempts, selectedQuestion]);

  const liveFeedback = useMemo(
    () =>
      selectedQuestion
        ? evaluateSpokenAnswer({
            prompt: selectedQuestion.prompt,
            transcript: answerDraft,
          })
        : null,
    [answerDraft, selectedQuestion],
  );

  const speechRecognitionSupported =
    typeof window !== "undefined" && !!resolveSpeechRecognitionConstructor();
  const speechSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!user) {
      setManualQuestions([]);
      setSelectedQuestionId(null);
      setAnswerDraft("");
      setAttempts([]);
      setNoticeMessage(null);
      setErrorMessage(null);
      return;
    }

    const storageKey = getInterviewDraftStorageKey(user.id);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setManualQuestions([]);
      setSelectedQuestionId(null);
      setAnswerDraft("");
      setAttempts([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<InterviewWorkspaceDraft>;
      if (Array.isArray(parsed.manualQuestions)) {
        const restoredManualQuestions: InterviewQuestion[] = [];
        for (const question of parsed.manualQuestions as unknown[]) {
          if (!question || typeof question !== "object") continue;
          const record = question as Record<string, unknown>;
          if (typeof record.id !== "string" || typeof record.prompt !== "string") {
            continue;
          }

          restoredManualQuestions.push({
            id: record.id,
            prompt: record.prompt,
            source: "manual",
          });
        }

        setManualQuestions(restoredManualQuestions);
      }

      if (
        parsed.selectedQuestionId == null ||
        typeof parsed.selectedQuestionId === "string"
      ) {
        setSelectedQuestionId(parsed.selectedQuestionId ?? null);
      }

      if (typeof parsed.answerDraft === "string") {
        setAnswerDraft(parsed.answerDraft);
        answerDraftRef.current = parsed.answerDraft;
      }

      if (Array.isArray(parsed.attempts)) {
        const restoredAttempts: InterviewAttempt[] = [];
        for (const attempt of parsed.attempts as unknown[]) {
          if (!attempt || typeof attempt !== "object") continue;
          const record = attempt as Record<string, unknown>;
          if (
            typeof record.id !== "string" ||
            typeof record.questionId !== "string" ||
            typeof record.questionPrompt !== "string" ||
            typeof record.transcript !== "string" ||
            typeof record.createdAt !== "string" ||
            typeof record.durationSeconds !== "number" ||
            !record.feedback ||
            typeof record.feedback !== "object"
          ) {
            continue;
          }

          const feedbackRecord = record.feedback as Record<string, unknown>;
          if (
            !isInterviewFeedbackLevel(feedbackRecord.level) ||
            typeof feedbackRecord.summary !== "string" ||
            !Array.isArray(feedbackRecord.tips)
          ) {
            continue;
          }

          restoredAttempts.push({
            id: record.id,
            questionId: record.questionId,
            questionPrompt: record.questionPrompt,
            transcript: record.transcript,
            createdAt: record.createdAt,
            durationSeconds: record.durationSeconds,
            feedback: {
              level: feedbackRecord.level,
              summary: feedbackRecord.summary,
              tips: feedbackRecord.tips.filter(
                (tip): tip is string => typeof tip === "string",
              ),
            },
          });
        }

        setAttempts(restoredAttempts.slice(0, 60));
      }
    } catch {
      window.localStorage.removeItem(storageKey);
      setManualQuestions([]);
      setSelectedQuestionId(null);
      setAnswerDraft("");
      setAttempts([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const storageKey = getInterviewDraftStorageKey(user.id);
    const draft: InterviewWorkspaceDraft = {
      manualQuestions,
      selectedQuestionId,
      answerDraft,
      attempts,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [answerDraft, attempts, manualQuestions, selectedQuestionId, user]);

  useEffect(() => {
    if (allQuestions.length === 0) {
      if (selectedQuestionId !== null) {
        setSelectedQuestionId(null);
      }
      return;
    }

    const exists = allQuestions.some((question) => question.id === selectedQuestionId);
    if (!exists) {
      setSelectedQuestionId(allQuestions[0]?.id ?? null);
    }
  }, [allQuestions, selectedQuestionId]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const saveAttempt = useCallback(
    (transcriptInput: string) => {
      if (!selectedQuestion) {
        setErrorMessage("Select a question before saving an answer.");
        return;
      }

      const transcript = normalizeTranscript(transcriptInput);
      if (!transcript) {
        setErrorMessage("Speak or type an answer before saving.");
        return;
      }

      const startedAt = recordingStartedAtRef.current;
      const durationSeconds = startedAt
        ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        : Math.max(1, Math.round(transcript.split(/\s+/).length / 2.5));
      const feedback = evaluateSpokenAnswer({
        prompt: selectedQuestion.prompt,
        transcript,
      });

      const nextAttempt: InterviewAttempt = {
        id: crypto.randomUUID(),
        questionId: selectedQuestion.id,
        questionPrompt: selectedQuestion.prompt,
        transcript,
        createdAt: new Date().toISOString(),
        durationSeconds,
        feedback,
      };

      setAttempts((current) => [nextAttempt, ...current].slice(0, 60));
      setNoticeMessage("Answer saved. Keep iterating to make your story tighter.");
      setErrorMessage(null);
      recordingStartedAtRef.current = null;
    },
    [selectedQuestion],
  );

  const startListening = useCallback(() => {
    if (!selectedQuestion) {
      setErrorMessage("Select a question before starting speaking practice.");
      return;
    }

    const Recognition = resolveSpeechRecognitionConstructor();
    if (!Recognition) {
      setErrorMessage(
        "Speech recognition is not available in this browser. You can still type answers below.",
      );
      return;
    }

    try {
      recognitionRef.current?.stop();
      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;

      recordingStartedAtRef.current = Date.now();
      answerDraftRef.current = "";
      setAnswerDraft("");

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result || result.length === 0) continue;
          const transcript = result[0]?.transcript || "";
          if (result.isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript + " ";
          }
        }

        const nextDraft = normalizeTranscript(
          `${answerDraftRef.current} ${finalTranscript} ${interimTranscript}`,
        );
        answerDraftRef.current = nextDraft;
        setAnswerDraft(nextDraft);
      };

      recognition.onerror = (event) => {
        setErrorMessage(`Speech capture stopped: ${event.error}. Try again.`);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;

        const transcript = normalizeTranscript(answerDraftRef.current);
        if (transcript) {
          saveAttempt(transcript);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      setNoticeMessage(
        "Listening started. Speak naturally; your answer will auto-save when you stop.",
      );
      setErrorMessage(null);
    } catch {
      setIsListening(false);
      setErrorMessage("Failed to start microphone capture. Check browser permissions.");
    }
  }, [saveAttempt, selectedQuestion]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speakQuestion = useCallback(() => {
    if (!selectedQuestion) {
      setErrorMessage("Select a question before playing audio.");
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setErrorMessage(
        "Text-to-speech is unavailable in this browser. Please read the question manually.",
      );
      return;
    }

    const utterance = new SpeechSynthesisUtterance(selectedQuestion.prompt);
    utterance.lang = "en-US";
    utterance.rate = 0.95;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setNoticeMessage("Reading the selected question aloud.");
    setErrorMessage(null);
  }, [selectedQuestion]);

  const addManualQuestion = useCallback(() => {
    const prompt = normalizeTranscript(manualQuestionInput);
    if (!prompt) {
      setErrorMessage("Type a question before adding it.");
      return;
    }

    const nextQuestion: InterviewQuestion = {
      id: `manual:${crypto.randomUUID()}`,
      prompt,
      source: "manual",
    };

    setManualQuestions((current) => [nextQuestion, ...current]);
    setManualQuestionInput("");
    setSelectedQuestionId(nextQuestion.id);
    setErrorMessage(null);
    setNoticeMessage("Custom interview question added.");
  }, [manualQuestionInput]);

  const removeManualQuestion = useCallback((questionId: string) => {
    setManualQuestions((current) =>
      current.filter((question) => question.id !== questionId),
    );
    setAttempts((current) =>
      current.filter((attempt) => attempt.questionId !== questionId),
    );
  }, []);

  if (status === "loading") {
    return (
      <Card role="status" aria-live="polite" className="mx-auto mt-16 max-w-md">
        <CardTitle>Checking session...</CardTitle>
        <CardDescription>
          We are verifying your account before opening interview practice.
        </CardDescription>
      </Card>
    );
  }

  if (!user) {
    return (
      <AuthRequiredModal
        id="interview-auth-required"
        title="Interview practice requires login"
        description="Sign in to save expected interview questions and practice spoken answers."
      />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Interview Studio</h1>
        <p className="text-sm text-slate-500">
          Prepare expected questions and practice answering out loud with instant
          transcript-based feedback.
        </p>
      </header>

      <Card className="space-y-3">
        <CardTitle>Expected interview questions</CardTitle>
        <CardDescription>
          Questions are predicted from your tracked jobs. Add custom prompts for
          role-specific prep.
        </CardDescription>

        <label htmlFor="manual-interview-question" className="text-sm font-medium">
          Add custom interview question
        </label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            id="manual-interview-question"
            value={manualQuestionInput}
            onChange={(event) => setManualQuestionInput(event.target.value)}
            placeholder="Add your own question (e.g., Explain your API caching strategy.)"
          />
          <Button onClick={addManualQuestion}>Add question</Button>
        </div>

        {allQuestions.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No interview questions yet. Save jobs first from the Jobs page to get
            predictions.
          </p>
        ) : (
          <ul className="space-y-2">
            {allQuestions.map((question) => {
              const selected = question.id === selectedQuestionId;
              return (
                <li key={question.id}>
                  <div
                    className={`rounded-xl border p-3 ${
                      selected
                        ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/40"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedQuestionId(question.id)}
                        className="text-left text-sm font-medium leading-6 text-slate-900 hover:underline dark:text-slate-100"
                        aria-pressed={selected}
                      >
                        {question.prompt}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {question.source === "manual" ? "Custom" : "Predicted"}
                        </span>
                        {question.source === "manual" ? (
                          <button
                            type="button"
                            onClick={() => removeManualQuestion(question.id)}
                            className="text-xs text-rose-700 underline dark:text-rose-300"
                            aria-label={`Remove question: ${question.prompt}`}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Speaking practice</CardTitle>
        <CardDescription>
          Practice with microphone capture or typed answers. Audio and transcripts
          stay on your browser.
        </CardDescription>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs uppercase tracking-wide text-slate-500">Selected question</p>
          <p className="mt-1 text-sm leading-6">
            {selectedQuestion?.prompt || "Select a question to start practice."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={speakQuestion}
            disabled={!selectedQuestion || !speechSynthesisSupported}
          >
            Play question audio
          </Button>
          <Button
            type="button"
            onClick={startListening}
            disabled={!selectedQuestion || isListening || !speechRecognitionSupported}
          >
            Start speaking
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={stopListening}
            disabled={!isListening}
          >
            Stop speaking
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => saveAttempt(answerDraft)}
            disabled={!selectedQuestion || !answerDraft.trim()}
          >
            Save typed answer
          </Button>
        </div>

        <div className="space-y-2">
          <label htmlFor="interview-answer" className="text-sm font-medium">
            Answer transcript
          </label>
          <Textarea
            id="interview-answer"
            className="min-h-[170px]"
            value={answerDraft}
            onChange={(event) => {
              setAnswerDraft(event.target.value);
              answerDraftRef.current = event.target.value;
            }}
            placeholder="Your spoken transcript (or typed answer) appears here..."
          />
        </div>

        <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
          <p className="font-medium">Live feedback</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {liveFeedback?.summary || "Start answering to see feedback."}
          </p>
          {liveFeedback?.tips.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              {liveFeedback.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {noticeMessage ? (
          <p className="text-sm text-green-700 dark:text-green-300">{noticeMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Recent answer attempts</CardTitle>
        <CardDescription>
          Review your recent responses and repeat until your message is concise and
          specific.
        </CardDescription>

        {selectedQuestionAttempts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No attempts yet for this question.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedQuestionAttempts.map((attempt) => (
              <li
                key={attempt.id}
                className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <p className="text-xs text-slate-500">
                  {formatAttemptDate(attempt.createdAt)} · {attempt.durationSeconds}s ·
                  {" "}
                  {attempt.feedback.level}
                </p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {attempt.transcript}
                </p>
                <p className="mt-2 text-sm font-medium">{attempt.feedback.summary}</p>
                {attempt.feedback.tips.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {attempt.feedback.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
