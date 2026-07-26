"use client";

import { Modal } from "@mantine/core";
import {
  BookOpenText,
  Clock3,
  Headphones,
  History,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
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
import styles from "./interview-page-client.module.css";

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
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isAttemptsModalOpen, setIsAttemptsModalOpen] = useState(false);

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

  const selectedQuestionIndex = useMemo(
    () =>
      selectedQuestion
        ? allQuestions.findIndex((question) => question.id === selectedQuestion.id)
        : -1,
    [allQuestions, selectedQuestion],
  );

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
    setAnswerDraft("");
    answerDraftRef.current = "";
    setIsQuestionModalOpen(false);
    setErrorMessage(null);
    setNoticeMessage("Custom interview question added.");
  }, [manualQuestionInput]);

  const selectQuestion = useCallback((questionId: string) => {
    setSelectedQuestionId(questionId);
    setAnswerDraft("");
    answerDraftRef.current = "";
    setNoticeMessage(null);
    setErrorMessage(null);
    setIsQuestionModalOpen(false);
  }, []);

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
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Focused practice</p>
          <h1>Interview Studio</h1>
          <p>
            Stay with one question at a time, shape a concise answer, and use
            feedback without leaving the practice view.
          </p>
          <div className={styles.workspaceStats} aria-label="Interview workspace summary">
            <span>{allQuestions.length} questions</span>
            <span>{attempts.length} saved attempts</span>
            <span>{candidateJobs.length} active jobs</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            leftSection={<BookOpenText size={16} aria-hidden="true" />}
            onClick={() => setIsQuestionModalOpen(true)}
          >
            Browse questions
          </Button>
          <Button
            type="button"
            variant="secondary"
            leftSection={<History size={16} aria-hidden="true" />}
            onClick={() => setIsAttemptsModalOpen(true)}
            disabled={!selectedQuestion}
          >
            Review attempts
          </Button>
        </div>
      </header>

      <Card className={styles.practiceCard}>
        <div className={styles.practiceCardHeader}>
          <div>
            <CardTitle>Speaking practice</CardTitle>
            <CardDescription>
              Audio and transcripts stay in this browser.
            </CardDescription>
          </div>
          {selectedQuestionAttempts.length > 0 ? (
            <button
              type="button"
              className={styles.attemptCountButton}
              onClick={() => setIsAttemptsModalOpen(true)}
            >
              <History size={15} aria-hidden="true" />
              {selectedQuestionAttempts.length} attempt
              {selectedQuestionAttempts.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>

        <section className={styles.questionStage} aria-labelledby="selected-question-label">
          <div className={styles.questionStageHeader}>
            <div className={styles.questionMeta}>
              <span id="selected-question-label">
                {selectedQuestionIndex >= 0
                  ? `Question ${selectedQuestionIndex + 1} of ${allQuestions.length}`
                  : "No question selected"}
              </span>
              {selectedQuestion ? (
                <span>
                  {selectedQuestion.source === "manual" ? "Custom" : "Predicted"}
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsQuestionModalOpen(true)}
            >
              Change question
            </Button>
          </div>
          <p className={styles.questionPrompt}>
            {selectedQuestion?.prompt ||
              "Choose a question from the library to start focused practice."}
          </p>
        </section>

        <div className={styles.practiceGrid}>
          <section className={styles.answerPanel} aria-labelledby="answer-panel-title">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.panelEyebrow}>Your response</p>
                <h2 id="answer-panel-title">Answer naturally</h2>
              </div>
              {isListening ? (
                <span className={styles.listeningIndicator}>
                  <span aria-hidden="true" />
                  Listening
                </span>
              ) : null}
            </div>

            <div className={styles.practiceControls}>
              <Button
                type="button"
                variant="secondary"
                leftSection={<Volume2 size={16} aria-hidden="true" />}
                onClick={speakQuestion}
                disabled={!selectedQuestion || !speechSynthesisSupported}
              >
                Play question
              </Button>
              {isListening ? (
                <Button
                  type="button"
                  leftSection={<Square size={14} aria-hidden="true" />}
                  onClick={stopListening}
                >
                  Stop & save
                </Button>
              ) : (
                <Button
                  type="button"
                  leftSection={<Mic size={16} aria-hidden="true" />}
                  onClick={startListening}
                  disabled={!selectedQuestion || !speechRecognitionSupported}
                >
                  Start speaking
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveAttempt(answerDraft)}
                disabled={!selectedQuestion || !answerDraft.trim()}
              >
                Save typed answer
              </Button>
            </div>

            <div className={styles.answerEditor}>
              <div className={styles.answerEditorHeader}>
                <label htmlFor="interview-answer">Answer transcript</label>
                <span>Aim for 45–90 seconds</span>
              </div>
              <Textarea
                id="interview-answer"
                className={styles.answerTextarea}
                value={answerDraft}
                onChange={(event) => {
                  setAnswerDraft(event.target.value);
                  answerDraftRef.current = event.target.value;
                }}
                placeholder="Type your answer here, or use Start speaking to capture it..."
              />
            </div>
          </section>

          <aside className={styles.feedbackPanel} aria-labelledby="feedback-panel-title">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.panelEyebrow}>Instant coaching</p>
                <h2 id="feedback-panel-title">Live feedback</h2>
              </div>
              {liveFeedback ? (
                <span
                  className={styles.feedbackLevel}
                  data-level={liveFeedback.level}
                >
                  {liveFeedback.level}
                </span>
              ) : null}
            </div>

            <div className={styles.feedbackSummary}>
              <Headphones size={20} aria-hidden="true" />
              <p>
                {liveFeedback?.summary ||
                  "Start answering to see feedback on clarity and structure."}
              </p>
            </div>

            {liveFeedback?.tips.length ? (
              <ol className={styles.feedbackTips}>
                {liveFeedback.tips.map((tip, index) => (
                  <li key={tip}>
                    <span>{index + 1}</span>
                    <p>{tip}</p>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className={styles.feedbackFooter}>
              <Clock3 size={15} aria-hidden="true" />
              <span>Saved answers can be reviewed from the attempts modal.</span>
            </div>

            {noticeMessage ? (
              <p className={styles.noticeMessage} role="status">
                {noticeMessage}
              </p>
            ) : null}
            {errorMessage ? (
              <p className={styles.errorMessage} role="alert">
                {errorMessage}
              </p>
            ) : null}
          </aside>
        </div>
      </Card>

      <Modal
        opened={isQuestionModalOpen}
        onClose={() => setIsQuestionModalOpen(false)}
        title="Question library"
        size="lg"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <div className={styles.modalBody}>
          <p className={styles.modalIntro}>
            Pick one question and return directly to practice. Predicted questions
            come from your active jobs.
          </p>

          <div className={styles.addQuestionPanel}>
            <label htmlFor="manual-interview-question">
              Add a role-specific question
            </label>
            <div className={styles.addQuestionForm}>
              <Input
                id="manual-interview-question"
                value={manualQuestionInput}
                onChange={(event) => setManualQuestionInput(event.target.value)}
                placeholder="e.g., Explain your API caching strategy."
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualQuestion();
                  }
                }}
              />
              <Button type="button" onClick={addManualQuestion}>
                Add question
              </Button>
            </div>
          </div>

          {allQuestions.length === 0 ? (
            <div className={styles.emptyState}>
              <BookOpenText size={22} aria-hidden="true" />
              <p>
                No questions yet. Save jobs first for predictions, or add your own
                question above.
              </p>
            </div>
          ) : (
            <ul className={styles.questionList}>
              {allQuestions.map((question, index) => {
                const selected = question.id === selectedQuestionId;
                const questionAttempts = attempts.filter(
                  (attempt) => attempt.questionId === question.id,
                ).length;

                return (
                  <li
                    key={question.id}
                    className={selected ? styles.selectedQuestionItem : undefined}
                  >
                    <button
                      type="button"
                      className={styles.questionSelectButton}
                      onClick={() => selectQuestion(question.id)}
                      aria-pressed={selected}
                    >
                      <span className={styles.questionNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.questionListCopy}>
                        <strong>{question.prompt}</strong>
                        <span>
                          {question.source === "manual" ? "Custom" : "Predicted"}
                          {" · "}
                          {questionAttempts} saved attempt
                          {questionAttempts === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className={styles.questionSelectLabel}>
                        {selected ? "Selected" : "Practice"}
                      </span>
                    </button>
                    {question.source === "manual" ? (
                      <button
                        type="button"
                        onClick={() => removeManualQuestion(question.id)}
                        className={styles.removeQuestionButton}
                        aria-label={`Remove question: ${question.prompt}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        opened={isAttemptsModalOpen}
        onClose={() => setIsAttemptsModalOpen(false)}
        title="Answer attempts"
        size="lg"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <div className={styles.modalBody}>
          <div className={styles.attemptsQuestion}>
            <span>Current question</span>
            <p>
              {selectedQuestion?.prompt ||
                "Choose a question before reviewing attempts."}
            </p>
          </div>

          {selectedQuestionAttempts.length === 0 ? (
            <div className={styles.emptyState}>
              <History size={22} aria-hidden="true" />
              <p>
                No attempts yet for this question. Save an answer, then review it
                here without extending the practice page.
              </p>
            </div>
          ) : (
            <ul className={styles.attemptList}>
              {selectedQuestionAttempts.map((attempt) => (
                <li key={attempt.id}>
                  <div className={styles.attemptMeta}>
                    <span>{formatAttemptDate(attempt.createdAt)}</span>
                    <span>{attempt.durationSeconds}s</span>
                    <span>{attempt.feedback.level}</span>
                  </div>
                  <p className={styles.attemptTranscript}>{attempt.transcript}</p>
                  <p className={styles.attemptSummary}>{attempt.feedback.summary}</p>
                  {attempt.feedback.tips.length > 0 ? (
                    <ul className={styles.attemptTips}>
                      {attempt.feedback.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}
