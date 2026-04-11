import type { GrantType, GrantStatus, GenderFocus, BusinessStage } from "@prisma/client";

export interface GrantData {
  title: string;
  description: string;
  sourceUrl: string;
  sourceName: string;
  amount?: string;
  amountMin?: number;
  amountMax?: number;
  deadline?: Date;
  eligibility?: string;
  grantType: GrantType;
  status: GrantStatus;
  businessStage: BusinessStage;
  gender: GenderFocus;
  locations: string[];
  industries: string[];
  pdfUrl?: string;
  rawData?: Record<string, unknown>;
  categories: string[];
  eligibleExpenses: string[];
}

export interface GrantListItem {
  id: string;
  title: string;
  description: string;
  sourceName: string;
  grantType: string;
  status: string;
  gender: string;
  businessStage: string;
  amount?: string | null;
  deadline?: string | null;
  locations: string[];
  eligibleExpenses: { name: string; label: string }[];
}

export type GrantSortKey = "deadline" | "rollingFirst" | "amount" | "recent" | "title";
export type GrantSortDir = "asc" | "desc";

export interface GrantFilters {
  search?: string;
  grantType?: GrantType[];
  gender?: GenderFocus[];
  businessStage?: BusinessStage[];
  location?: string;
  industry?: string;
  status?: GrantStatus[];
  amountMin?: number;
  amountMax?: number;
  eligibleExpense?: string[];
  sort?: GrantSortKey;
  dir?: GrantSortDir;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScraperResult {
  source: string;
  grants: GrantData[];
  error?: string;
}
