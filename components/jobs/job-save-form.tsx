"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJobSchema, type CreateJobInput, type CreateJobParsed } from "@/lib/validators";
import {
  currencyOptions,
  employmentTypeOptions,
  remoteTypeLabels,
  remoteTypeOptions,
  sourceLabels,
  sourceOptions,
  statusLabels,
  statusOptions,
} from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const defaultValues: CreateJobInput = {
  source: "MANUAL",
  sourceUrl: "",
  company: "",
  title: "",
  location: "",
  remoteType: "UNKNOWN",
  employmentType: "",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: "CAD",
  seniority: "",
  workAuthorizationNote: "",
  descriptionRaw: "",
  status: "SAVED",
  notes: "",
  tags: "",
};

type SaveFormProps = {
  onSubmit: (values: CreateJobParsed) => Promise<void>;
};

export function JobSaveForm({ onSubmit }: SaveFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateJobInput, unknown, CreateJobParsed>({
    resolver: zodResolver(createJobSchema),
    defaultValues,
  });

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        try {
          setSubmitError(null);
          await onSubmit(values);
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "Failed to save posting");
        }
      })}
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">Source</label>
        <Select {...register("source")}>
          {sourceOptions.map((value) => (
            <option key={value} value={value}>
              {sourceLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Original URL</label>
        <Input {...register("sourceUrl")} placeholder="https://..." />
        {errors.sourceUrl && <p className="text-xs text-rose-500">{errors.sourceUrl.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Company</label>
        <Input {...register("company")} placeholder="Shopify" />
        {errors.company && <p className="text-xs text-rose-500">{errors.company.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Title</label>
        <Input {...register("title")} placeholder="Frontend Engineer" />
        {errors.title && <p className="text-xs text-rose-500">{errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Location</label>
        <Input {...register("location")} placeholder="Toronto, ON" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Remote Type</label>
        <Select {...register("remoteType")}>
          {remoteTypeOptions.map((value) => (
            <option key={value} value={value}>
              {remoteTypeLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Employment Type</label>
        <Select {...register("employmentType")}>
          <option value="">Select</option>
          {employmentTypeOptions.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Seniority</label>
        <Input {...register("seniority")} placeholder="Junior / Mid / Senior" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Salary Min</label>
        <Input type="number" {...register("salaryMin")} placeholder="100000" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Salary Max</label>
        <Input type="number" {...register("salaryMax")} placeholder="140000" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Currency</label>
        <Select {...register("salaryCurrency")}>
          {currencyOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1 lg:col-span-2">
        <label className="text-sm font-medium">Work Authorization Note</label>
        <Input {...register("workAuthorizationNote")} placeholder="Must be authorized in Canada" />
      </div>

      <div className="space-y-1 lg:col-span-2">
        <label className="text-sm font-medium">Description Raw</label>
        <Textarea {...register("descriptionRaw")} placeholder="Paste original job description text here" className="min-h-[180px]" />
        {errors.descriptionRaw && <p className="text-xs text-rose-500">{errors.descriptionRaw.message}</p>}
      </div>

      <div className="space-y-1 lg:col-span-2">
        <label className="text-sm font-medium">Tags (comma separated)</label>
        <Input {...register("tags")} placeholder="frontend, canada, react" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Initial Status</label>
        <Select {...register("status")}>
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1 lg:col-span-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea {...register("notes")} placeholder="Why this posting matters, risks, next action..." className="min-h-[120px]" />
      </div>

      <div className="lg:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Job Posting"}
        </Button>
        {submitError ? <p className="mt-2 text-sm text-rose-500">{submitError}</p> : null}
      </div>
    </form>
  );
}
