import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VideosORM, type VideosModel } from "@/sdk/database/orm/orm_videos";
import { QuestionsORM, type QuestionsModel } from "@/sdk/database/orm/orm_questions";
import { TrainingSessionsORM, type TrainingSessionsModel } from "@/sdk/database/orm/orm_training_sessions";
import { UserProgressORM, type UserProgressModel } from "@/sdk/database/orm/orm_user_progress";
import { QuizAttemptsORM, type QuizAttemptsModel } from "@/sdk/database/orm/orm_quiz_attempts";
import { CompletionsORM, type CompletionsModel } from "@/sdk/database/orm/orm_completions";
import { UsersORM, type UsersModel } from "@/sdk/database/orm/orm_users";
import { Play, Pause, CheckCircle2, XCircle, Trophy, Settings, Users, Trash2, LogOut, UserCircle, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateData, CreateValue, DataStoreClient, ParseValue } from "@/sdk/database/orm/client";
import { DataType, SimpleSelector, type Value } from "@/sdk/database/orm/common";
import Player from "@vimeo/player";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
	addDays,
	addMonths,
	differenceInCalendarDays,
	endOfMonth,
	endOfWeek,
	format,
	getDay,
	isSameMonth,
	parseISO,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
} from "date-fns";

export const Route = createFileRoute("/")({
	component: App,
});

const ADMIN_PASSWORD = "K7M2X9Q8LP";
const ADMIN_EMAIL = "admin@platform.com";
const DEFAULT_ROLE = "recruit";
const PAYROLL_API_BASE = import.meta.env.VITE_PAYROLL_API_BASE || "http://localhost:5000";
const PAYROLL_STORE = {
	id: "payroll_snapshot_v1",
	namespace: "training_app",
	name: "payroll_snapshot",
	version: "1",
	task: "payroll",
};
const PAYROLL_KEY = "current";
const PAYROLL_API_BASE_CLEAN = PAYROLL_API_BASE.replace(/\/+$/, "");
const PAYROLL_API_HINT = `Check VITE_PAYROLL_API_BASE (currently ${PAYROLL_API_BASE_CLEAN}) points to the payroll backend that implements POST /api/analyze and POST /api/ai-test.`;
const CHATTER_ADMIN_STORE = {
	id: "chatter_admin_v1",
	namespace: "training_app",
	name: "chatter_admin",
	version: "1",
	task: "chatter_admin",
};
const BULZE_DEFAULT_NAMES = ["djozli", "bash", "matke", "voki", "totadjes"];
const PAYROLL_PERCENT_STORE = {
	id: "payroll_percent_v1",
	namespace: "training_app",
	name: "payroll_percent",
	version: "1",
	task: "payroll",
};
const PAYROLL_PERCENT_KEY = "current";
const DAILY_VIDEO_STORE = PAYROLL_PERCENT_STORE;
const DAILY_VIDEO_KEY = "daily_video_current";

type PayrollEmployee = {
	employee: string;
	sales: number;
	bonus: number;
	tips: number;
	daily_bonus?: Record<string, number>;
	shifts?: Array<{
		date: string;
		sales?: number;
		bonus?: number;
	}>;
	percent?: number;
	penalty?: number;
	ppv_sales?: number;
	dm_sales?: number;
	daily_sales?: Record<string, number>;
	clocked_hours?: number;
	scheduled_hours?: number;
	sales_per_hour?: number;
	messages_per_hour?: number;
	fans_per_hour?: number;
	response_clock_avg?: number;
	insights?: string[];
	compare?: {
		sales?: PayrollCompareMetric;
		sales_per_hour?: PayrollCompareMetric;
		messages_per_hour?: PayrollCompareMetric;
		response_clock_avg?: PayrollCompareMetric;
		chat_paid_offers?: PayrollCompareMetric;
		chat_conversion_rate?: PayrollCompareMetric;
	};
	chat_ai?: {
		why_money?: string[];
		how_money?: string[];
		ppv_suggestions?: string[];
		bait_suggestions?: string[];
	};
	chat?: {
		top_sentences?: Array<{ text: string }>;
		top_baits?: Array<{ text: string }>;
	};
};

type PayrollCompareMetric = {
	rank?: number;
	total?: number;
	percentile?: number;
};

type PayrollPpvItem = {
	text: string;
	purchased?: number;
	count?: number;
};

type PayrollPpvDay = {
	ass?: PayrollPpvItem[];
	tits?: PayrollPpvItem[];
	overall?: PayrollPpvItem[];
};

type PayrollSnapshot = {
	min_date: string;
	max_date: string;
	employees: PayrollEmployee[];
	ai_status?: string;
	ppv_day?: PayrollPpvDay;
};

type DailyVideo = {
	id: string;
	title: string;
	description?: string;
	url: string;
	duration: number;
	created_at: string;
	active: boolean;
	thumbnail_url?: string;
};

type PayrollEmployeeFeedback = {
	strengths?: string[];
	improvements?: string[];
	next_steps?: string[];
	error?: string;
};

type ChatFeedback = {
	summary?: string;
	strengths?: string[];
	improvements?: string[];
	tos_flags?: string[];
	risk_score?: number;
	greedy_score?: number;
	fantasy_score?: number;
	error?: string;
};

type ChatterAdminMeta = {
	manual_bonus?: number;
	bonus_entries?: Array<{
		id: string;
		type: "shift" | "double_shift" | "holiday";
		amount: number;
		date: string;
	}>;
	manual_penalty?: number;
	admin_notes?: string;
	admin_review?: string;
	bulze_share?: boolean;
	login_streak?: number;
	last_login_date?: string;
};

const payrollClient = DataStoreClient.getInstance();

const valuesToObject = (values: Value[]) => {
	const obj: Record<string, unknown> = {};
	for (const value of values || []) {
		if (!value.name) continue;
		obj[value.name] = ParseValue(value, value.type);
	}
	return obj;
};

const normalizeName = (value?: string | null) => (value || "").trim().toLowerCase();
const buildDefaultChatterMeta = (): ChatterAdminMeta => ({
	manual_bonus: 0,
	bonus_entries: [],
	manual_penalty: 0,
	admin_notes: "",
	admin_review: "",
	bulze_share: false,
	login_streak: 0,
	last_login_date: undefined,
});

const buildPayrollIndex = (key: string) => ({
	fields: ["key"],
	values: [CreateValue(DataType.string, key, "key")],
});

const fetchPayrollSnapshot = async () => {
	const response = await payrollClient.get({
		...PAYROLL_STORE,
		index: buildPayrollIndex(PAYROLL_KEY),
		format: { structured: true },
	});
	const structured = response.data?.values?.[0]?.structured || [];
	if (structured.length === 0) {
		return { snapshot: null, updatedAt: null };
	}
	const record = valuesToObject(structured) as {
		snapshot?: PayrollSnapshot;
		updated_at?: string;
	};
	return {
		snapshot: record.snapshot ?? null,
		updatedAt: record.updated_at ?? null,
	};
};

const savePayrollSnapshot = async (snapshot: PayrollSnapshot) => {
	const updatedAt = new Date().toISOString();
	const data = CreateData([
		CreateValue(DataType.string, PAYROLL_KEY, "key"),
		CreateValue(DataType.object, snapshot, "snapshot"),
		CreateValue(DataType.string, updatedAt, "updated_at"),
	]);

	await payrollClient.set({
		...PAYROLL_STORE,
		index: buildPayrollIndex(PAYROLL_KEY),
		data,
		format: { structured: true },
	});

	return updatedAt;
};

const clearPayrollSnapshot = async () => {
	await payrollClient.delete({
		...PAYROLL_STORE,
		index: buildPayrollIndex(PAYROLL_KEY),
		format: { structured: true },
	});
};

const buildPayrollPercentIndex = (key: string) => ({
	fields: ["key"],
	values: [CreateValue(DataType.string, key, "key")],
});

const buildDailyVideoIndex = (key: string) => ({
	fields: ["key"],
	values: [CreateValue(DataType.string, key, "key")],
});

const fetchPayrollPercentOverrides = async () => {
	const response = await payrollClient.get({
		...PAYROLL_PERCENT_STORE,
		index: buildPayrollPercentIndex(PAYROLL_PERCENT_KEY),
		format: { structured: true },
	});
	const structured = response.data?.values?.[0]?.structured || [];
	if (structured.length === 0) {
		return { overrides: {} as Record<string, number>, updatedAt: null as string | null };
	}
	const record = valuesToObject(structured) as {
		overrides?: Record<string, number>;
		updated_at?: string;
	};
	return {
		overrides: record.overrides ?? {},
		updatedAt: record.updated_at ?? null,
	};
};

const savePayrollPercentOverrides = async (overrides: Record<string, number>) => {
	const updatedAt = new Date().toISOString();
	const data = CreateData([
		CreateValue(DataType.string, PAYROLL_PERCENT_KEY, "key"),
		CreateValue(DataType.object, overrides, "overrides"),
		CreateValue(DataType.string, updatedAt, "updated_at"),
	]);

	await payrollClient.set({
		...PAYROLL_PERCENT_STORE,
		index: buildPayrollPercentIndex(PAYROLL_PERCENT_KEY),
		data,
		format: { structured: true },
	});

	return updatedAt;
};

const fetchDailyVideos = async () => {
	const response = await payrollClient.get({
		...DAILY_VIDEO_STORE,
		index: buildDailyVideoIndex(DAILY_VIDEO_KEY),
		format: { structured: true },
	});
	const structured = response.data?.values?.[0]?.structured || [];
	if (structured.length === 0) {
		return { videos: [] as DailyVideo[], updatedAt: null as string | null };
	}
	const record = valuesToObject(structured) as {
		overrides?: { videos?: DailyVideo[] };
		updated_at?: string;
	};
	const overrides = record.overrides ?? {};
	return {
		videos: Array.isArray(overrides.videos) ? overrides.videos : [],
		updatedAt: record.updated_at ?? null,
	};
};

const saveDailyVideos = async (videos: DailyVideo[]) => {
	const updatedAt = new Date().toISOString();
	const data = CreateData([
		CreateValue(DataType.string, DAILY_VIDEO_KEY, "key"),
		CreateValue(DataType.object, { videos }, "overrides"),
		CreateValue(DataType.string, updatedAt, "updated_at"),
	]);

	await payrollClient.set({
		...DAILY_VIDEO_STORE,
		index: buildDailyVideoIndex(DAILY_VIDEO_KEY),
		data,
		format: { structured: true },
	});

	return updatedAt;
};

const buildChatterAdminIndex = (userId: string) => ({
	fields: ["user_id"],
	values: [CreateValue(DataType.string, userId, "user_id")],
});

const fetchChatterAdminMeta = async (userId: string) => {
	const response = await payrollClient.get({
		...CHATTER_ADMIN_STORE,
		index: buildChatterAdminIndex(userId),
		format: { structured: true },
	});
	const structured = response.data?.values?.[0]?.structured || [];
	if (structured.length === 0) {
		return { meta: null as ChatterAdminMeta | null, updatedAt: null as string | null };
	}
	const record = valuesToObject(structured) as {
		manual_bonus?: number;
		bonus_entries?: ChatterAdminMeta["bonus_entries"];
		manual_penalty?: number;
		admin_notes?: string;
		admin_review?: string;
		bulze_share?: boolean;
		login_streak?: number;
		last_login_date?: string;
		updated_at?: string;
	};
	return {
		meta: {
			manual_bonus: Number(record.manual_bonus ?? 0),
			bonus_entries: Array.isArray(record.bonus_entries) ? record.bonus_entries : [],
			manual_penalty: Number(record.manual_penalty ?? 0),
			admin_notes: String(record.admin_notes ?? ""),
			admin_review: String(record.admin_review ?? ""),
			bulze_share: Boolean(record.bulze_share ?? false),
			login_streak: Number(record.login_streak ?? 0),
			last_login_date: record.last_login_date ? String(record.last_login_date) : undefined,
		},
		updatedAt: record.updated_at ?? null,
	};
};

const saveChatterAdminMeta = async (userId: string, meta: ChatterAdminMeta) => {
	const updatedAt = new Date().toISOString();
	const data = CreateData([
		CreateValue(DataType.string, userId, "user_id"),
		CreateValue(DataType.number, Number(meta.manual_bonus ?? 0), "manual_bonus"),
		CreateValue(DataType.object, meta.bonus_entries ?? [], "bonus_entries"),
		CreateValue(DataType.number, Number(meta.manual_penalty ?? 0), "manual_penalty"),
		CreateValue(DataType.string, meta.admin_notes ?? "", "admin_notes"),
		CreateValue(DataType.string, meta.admin_review ?? "", "admin_review"),
		CreateValue(DataType.boolean, Boolean(meta.bulze_share ?? false), "bulze_share"),
		CreateValue(DataType.number, Number(meta.login_streak ?? 0), "login_streak"),
		CreateValue(DataType.string, meta.last_login_date ?? "", "last_login_date"),
		CreateValue(DataType.string, updatedAt, "updated_at"),
	]);

	await payrollClient.set({
		...CHATTER_ADMIN_STORE,
		index: buildChatterAdminIndex(userId),
		data,
		format: { structured: true },
	});

	return updatedAt;
};

// Helper function to extract YouTube video ID from URL
function getYouTubeVideoId(url: string): string | null {
	if (!url) return null;

	// Handle different YouTube URL formats
	const patterns = [
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}

	return null;
}

// Helper function to extract Loom video ID from URL
function getLoomVideoId(url: string): string | null {
	if (!url) return null;

	// Handle different Loom URL formats
	// https://www.loom.com/share/abc123
	// https://loom.com/share/abc123
	const patterns = [
		/(?:https?:\/\/)?(?:www\.)?loom\.com\/share\/([a-zA-Z0-9]+)/,
		/(?:https?:\/\/)?(?:www\.)?loom\.com\/embed\/([a-zA-Z0-9]+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}

	return null;
}

// Helper function to extract Vimeo video ID from URL
function getVimeoVideoId(url: string): string | null {
	if (!url) return null;

	const patterns = [
		/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
		/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/channels\/[^/]+\/(\d+)/,
		/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/album\/\d+\/video\/(\d+)/,
		/(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}

	return null;
}

function evaluateAnswerLocally(question: string, idealAnswer: string, userAnswer: string) {
	const toTokens = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, " ")
			.split(/\s+/)
			.filter((token) => token.length >= 2);

	const idealTokens = new Set(toTokens(idealAnswer));
	const userTokens = new Set(toTokens(userAnswer));

	if (idealTokens.size === 0 || userTokens.size === 0) {
		return {
			isCorrect: false,
			feedback: "Answer is too short to evaluate",
		};
	}

	let overlap = 0;
	for (const token of idealTokens) {
		if (userTokens.has(token)) overlap += 1;
	}

	const precision = overlap / Math.max(userTokens.size, 1);
	const recall = overlap / Math.max(idealTokens.size, 1);
	const similarity = (precision + recall) / 2;
	const isCorrect = similarity >= 0.35;

	return {
		isCorrect,
		feedback: isCorrect
			? "Correct - Key concepts match the expected answer"
			: "Incorrect - Missing key concepts from the expected answer",
	};
}

async function evaluateAnswerWithGrok(
	question: string,
	idealAnswer: string,
	userAnswer: string,
) {
	const apiBaseRaw = import.meta.env.VITE_API_BASE_PATH || PAYROLL_API_BASE || "";
	const apiBase = apiBaseRaw.replace(/\/+$/, "");
	if (!apiBase) return null;

	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), 20000);

	try {
		const response = await fetch(`${apiBase}/api/ai/evaluate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				question,
				idealAnswer,
				userAnswer,
			}),
			signal: controller.signal,
		});

		if (!response.ok) return null;
		return (await response.json()) as { correct?: boolean; score?: number; feedback?: string };
	} catch {
		return null;
	} finally {
		window.clearTimeout(timeoutId);
	}
}

function App() {
	const [view, setView] = useState<"admin" | "user">("user");
	const [currentUser, setCurrentUser] = useState<UsersModel | null>(null);
	const isAdmin = Boolean(currentUser?.is_admin || currentUser?.email === ADMIN_EMAIL);
	const isApproved = Boolean(currentUser && (isAdmin || currentUser.is_approved));
	const [streakCelebration, setStreakCelebration] = useState<{ streak: number; dateKey: string } | null>(null);

	const triggerStreakCelebration = (userId: string, streak: number, dateKey: string) => {
		if (!userId || !streak || !dateKey) return;
		const shownKey = `login_streak_shown_${userId}_${dateKey}`;
		if (sessionStorage.getItem(shownKey)) return;
		const show = () => {
			sessionStorage.setItem(shownKey, "1");
			setStreakCelebration({ streak, dateKey });
			window.setTimeout(() => setStreakCelebration(null), 3500);
		};
		if (document.readyState === "complete") {
			window.setTimeout(show, 150);
			return;
		}
		const onLoad = () => {
			window.removeEventListener("load", onLoad);
			window.setTimeout(show, 150);
		};
		window.addEventListener("load", onLoad);
	};

	const updateLoginStreakForUser = async (user: UsersModel) => {
		if (!user || user.is_admin) return null;
		const todayKey = format(new Date(), "yyyy-MM-dd");
		const response = await fetchChatterAdminMeta(user.id);
		const meta = response.meta ? { ...buildDefaultChatterMeta(), ...response.meta } : buildDefaultChatterMeta();

		if (meta.last_login_date === todayKey) {
			return { streak: Number(meta.login_streak ?? 0), updated: false, dateKey: todayKey };
		}

		let nextStreak = 1;
		const lastKey = meta.last_login_date;
		if (lastKey) {
			let lastDate: Date | null = null;
			try {
				lastDate = parseISO(lastKey);
			} catch {
				lastDate = null;
			}
			if (lastDate) {
				const diff = differenceInCalendarDays(new Date(), lastDate);
				if (diff === 1) {
					const prev = Number(meta.login_streak ?? 0);
					nextStreak = Math.max(1, prev) + 1;
				} else if (diff === 0) {
					nextStreak = Number(meta.login_streak ?? 1) || 1;
				} else {
					nextStreak = 1;
				}
			}
		}

		meta.last_login_date = todayKey;
		meta.login_streak = nextStreak;
		await saveChatterAdminMeta(user.id, meta);
		return { streak: nextStreak, updated: true, dateKey: todayKey };
	};

	// Check for logged in user on mount
	useEffect(() => {
		const userId = sessionStorage.getItem("current_user_id");
		if (userId) {
			const usersOrm = UsersORM.getInstance();
			usersOrm.getUsersByIDs([userId]).then((users) => {
				if (users.length > 0) {
					setCurrentUser(users[0]);
					updateLoginStreakForUser(users[0])
						.then((result) => {
							if (result) triggerStreakCelebration(users[0].id, result.streak, result.dateKey);
						})
						.catch(() => {});
				} else {
					sessionStorage.removeItem("current_user_id");
				}
			});
		}
	}, []);

	const handleLogin = (user: UsersModel) => {
		setCurrentUser(user);
		sessionStorage.setItem("current_user_id", user.id);
		updateLoginStreakForUser(user)
			.then((result) => {
				if (result) triggerStreakCelebration(user.id, result.streak, result.dateKey);
			})
			.catch(() => {});
	};

	const handleLogout = () => {
		setCurrentUser(null);
		sessionStorage.removeItem("current_user_id");
	};

	// Show login screen if no user is logged in and in user view
	if (!currentUser && view === "user") {
		return <LoginScreen onLogin={handleLogin} />;
	}

	if (currentUser && !isApproved) {
		return <PendingApprovalScreen user={currentUser} onLogout={handleLogout} />;
	}

	return (
		<div className="min-h-screen app-shell chatter-neo">
			<div className="container mx-auto py-8 px-4">
				<div className="flex justify-between items-center mb-8">
					<div>
						<h1 className="text-4xl font-bold text-slate-100">Dionysus Training</h1>
					</div>
					<div className="flex items-center gap-4">
						{currentUser && view === "user" && (
							<div className="flex items-center gap-2 text-slate-300">
								<UserCircle className="w-5 h-5" />
								<span className="font-medium">{currentUser.name}</span>
								<Button variant="outline" size="sm" onClick={handleLogout} className="ml-2 border-slate-700 hover:bg-slate-800">
									<LogOut className="w-4 h-4 mr-1" />
									Logout
								</Button>
							</div>
						)}
						{/* Only show tab switcher for admin users */}
						{isAdmin && (
							<Tabs value={view} onValueChange={(v) => setView(v as "admin" | "user")}>
								<TabsList>
									<TabsTrigger value="user" className="gap-2">
										<Users className="w-4 h-4" />
										User View
									</TabsTrigger>
									<TabsTrigger value="admin" className="gap-2">
										<Settings className="w-4 h-4" />
										Admin Panel
									</TabsTrigger>
								</TabsList>
							</Tabs>
						)}
					</div>
				</div>

				{view === "admin" && isAdmin ? <AdminPanel /> : currentUser && <UserView user={currentUser} />}
			</div>
			{streakCelebration && (
				<div className="streak-overlay" role="status">
					<div className="streak-overlay-card">
						<div className="streak-flame">
							<Flame className="w-10 h-10" />
						</div>
						<div className="streak-overlay-text">
							<span>Login streak</span>
							<strong>{streakCelebration.streak} days</strong>
						</div>
					</div>
					<div className="streak-confetti">
						{Array.from({ length: 18 }).map((_, idx) => (
							<span key={idx} style={{ ["--i" as string]: idx }} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function AdminPanel() {
	const [activeTab, setActiveTab] = useState<"management" | "training">("management");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "management" | "training")}>
			<div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
				<Card className="chatter-panel h-fit">
					<CardHeader>
						<CardTitle className="text-slate-100">Admin</CardTitle>
						<CardDescription className="text-slate-400">
							Management, payroll, trainings
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TabsList className="flex flex-col w-full h-auto bg-transparent border-0 p-0 gap-2">
							<TabsTrigger value="management" className="justify-start gap-2 w-full flex-none">
								<Users className="w-4 h-4" />
								Management
							</TabsTrigger>
							<TabsTrigger value="training" className="justify-start gap-2 w-full flex-none">
								<Settings className="w-4 h-4" />
								Training
							</TabsTrigger>
						</TabsList>
					</CardContent>
				</Card>

				<div className="min-w-0">
					<TabsContent value="management" className="mt-0">
						<ManagementPanel />
					</TabsContent>
					<TabsContent value="training" className="mt-0">
						<TrainingPanel />
					</TabsContent>
				</div>
			</div>
		</Tabs>
	);
}

function ManagementPanel() {
	const [activeTab, setActiveTab] = useState<"feedback" | "users" | "payroll" | "roles" | "daily">("users");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "feedback" | "users" | "payroll" | "roles")}>
			<div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-6">
				<Card className="chatter-panel h-fit">
					<CardHeader>
						<CardTitle className="text-slate-100">Management</CardTitle>
						<CardDescription className="text-slate-400">
							Approvals and payroll tools
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TabsList className="flex flex-col w-full h-auto bg-transparent border-0 p-0 gap-2">
							<TabsTrigger value="feedback" className="justify-start w-full flex-none">
								Feedback
							</TabsTrigger>
							<TabsTrigger value="users" className="justify-start w-full flex-none">
								User approvals
							</TabsTrigger>
							<TabsTrigger value="payroll" className="justify-start w-full flex-none">
								Payroll
							</TabsTrigger>
							<TabsTrigger value="daily" className="justify-start w-full flex-none">
								Daily video
							</TabsTrigger>
							<TabsTrigger value="roles" className="justify-start w-full flex-none">
								Roles & inflow
							</TabsTrigger>
						</TabsList>
					</CardContent>
				</Card>

				<div className="min-w-0">
					<TabsContent value="feedback" className="mt-0">
						<ChatterFeedbackPanel />
					</TabsContent>
					<TabsContent value="users" className="mt-0">
						<UserApprovalsPanel />
					</TabsContent>
					<TabsContent value="payroll" className="mt-0">
						<PayrollPanel />
					</TabsContent>
					<TabsContent value="daily" className="mt-0">
						<DailyVideoPanel />
					</TabsContent>
					<TabsContent value="roles" className="mt-0">
						<TrainingRolesPanel />
					</TabsContent>
				</div>
			</div>
		</Tabs>
	);
}

function TrainingPanel() {
	const [activeTab, setActiveTab] = useState<"create" | "manage" | "submissions">("create");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "manage" | "submissions")}>
			<div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-6">
				<Card className="chatter-panel h-fit">
					<CardHeader>
						<CardTitle className="text-slate-100">Training</CardTitle>
						<CardDescription className="text-slate-400">
							Create and manage learning
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TabsList className="flex flex-col w-full h-auto bg-transparent border-0 p-0 gap-2">
							<TabsTrigger value="create" className="justify-start w-full flex-none">
								Create training
							</TabsTrigger>
							<TabsTrigger value="manage" className="justify-start w-full flex-none">
								Manage tests
							</TabsTrigger>
							<TabsTrigger value="submissions" className="justify-start w-full flex-none">
								Submissions
							</TabsTrigger>
						</TabsList>
					</CardContent>
				</Card>

				<div className="min-w-0">
					<TabsContent value="create" className="mt-0">
						<CreateTrainingPanel />
					</TabsContent>
					<TabsContent value="manage" className="mt-0">
						<ManageTestsPanel />
					</TabsContent>
					<TabsContent value="submissions" className="mt-0">
						<AllSubmissionsPanel />
					</TabsContent>
				</div>
			</div>
		</Tabs>
	);
}

function CreateTrainingPanel() {
	const [videoUrl, setVideoUrl] = useState("");
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoTitle, setVideoTitle] = useState("");
	const [videoDescription, setVideoDescription] = useState("");
	const [videoDuration, setVideoDuration] = useState(0);
	const [passThreshold, setPassThreshold] = useState(7);
	const [verificationCode, setVerificationCode] = useState("");
	const [questions, setQuestions] = useState<Array<{ text: string; idealAnswer: string }>>([
		{ text: "", idealAnswer: "" },
	]);

	const queryClient = useQueryClient();
	const videosOrm = VideosORM.getInstance();
	const questionsOrm = QuestionsORM.getInstance();
	const sessionsOrm = TrainingSessionsORM.getInstance();

	const { data: videos = [] } = useQuery({
		queryKey: ["videos"],
		queryFn: () => videosOrm.getAllVideos(),
	});

	const createTraining = useMutation({
		mutationFn: async () => {
			let finalVideoUrl = videoUrl;

			// If video file is uploaded, create a blob URL
			if (videoFile) {
				finalVideoUrl = URL.createObjectURL(videoFile);
			}

			const [newVideo] = await videosOrm.insertVideos([
				{
					title: videoTitle,
					description: videoDescription,
					url: finalVideoUrl,
					duration: videoDuration,
				} as VideosModel,
			]);

			const questionData = questions
				.filter((q) => q.text.trim() && q.idealAnswer.trim())
				.map((q, idx) => ({
					video_id: newVideo.id,
					text: q.text,
					ideal_answer: q.idealAnswer,
					sequence_number: idx + 1,
				} as QuestionsModel));

			await questionsOrm.insertQuestions(questionData);

			await sessionsOrm.insertTrainingSessions([
				{
					video_id: newVideo.id,
					pass_threshold: passThreshold,
					total_questions: questionData.length,
					is_active: true,
					verification_code: verificationCode,
				} as TrainingSessionsModel,
			]);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videos"] });
			setVideoUrl("");
			setVideoFile(null);
			setVideoTitle("");
			setVideoDescription("");
			setVideoDuration(0);
			setPassThreshold(7);
			setVerificationCode("");
			setQuestions([{ text: "", idealAnswer: "" }]);
		},
	});

	const deleteVideo = useMutation({
		mutationFn: async (videoId: string) => {
			await videosOrm.deleteVideosByIDs([videoId]);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videos"] });
		},
	});

	const addQuestion = () => {
		if (questions.length < 10) {
			setQuestions([...questions, { text: "", idealAnswer: "" }]);
		}
	};

	const updateQuestion = (idx: number, field: "text" | "idealAnswer", value: string) => {
		const updated = [...questions];
		updated[idx][field] = value;
		setQuestions(updated);
	};

	const removeQuestion = (idx: number) => {
		setQuestions(questions.filter((_, i) => i !== idx));
	};

	const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setVideoFile(file);
			setVideoUrl(""); // Clear URL if file is selected

			// Auto-detect video duration
			const videoElement = document.createElement("video");
			videoElement.preload = "metadata";
			videoElement.onloadedmetadata = () => {
				setVideoDuration(Math.floor(videoElement.duration));
				URL.revokeObjectURL(videoElement.src);
			};
			videoElement.src = URL.createObjectURL(file);
		}
	};

	return (
		<div className="space-y-6">
			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Create New Training Module</CardTitle>
					<CardDescription className="text-slate-400">Upload a video and create quiz questions with ideal answers</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="videoTitle">Video Title</Label>
							<Input
								id="videoTitle"
								value={videoTitle}
								onChange={(e) => setVideoTitle(e.target.value)}
								placeholder="Introduction to React"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="videoDuration">
								Duration (seconds) {videoFile && videoDuration > 0 && "- Auto-detected"}
							</Label>
							<Input
								id="videoDuration"
								type="number"
								value={videoDuration}
								onChange={(e) => setVideoDuration(Number(e.target.value))}
								placeholder="Auto-detected from file or enter manually"
							/>
						</div>
					</div>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="videoFile">Upload Video File</Label>
							<Input
								id="videoFile"
								type="file"
								accept="video/*"
								onChange={handleVideoFileChange}
								className="cursor-pointer"
							/>
							{videoFile && (
								<p className="text-sm text-green-600">
									Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
								</p>
							)}
						</div>

						<div className="flex items-center gap-4">
							<Separator className="flex-1" />
							<span className="text-sm text-slate-500">OR</span>
							<Separator className="flex-1" />
						</div>

						<div className="space-y-2">
							<Label htmlFor="videoUrl">Video URL</Label>
							<Input
								id="videoUrl"
								value={videoUrl}
								onChange={(e) => {
									setVideoUrl(e.target.value);
									setVideoFile(null); // Clear file if URL is entered
								}}
								placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/... or https://loom.com/share/... or https://example.com/video.mp4"
								disabled={!!videoFile}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="videoDescription">Description</Label>
						<Textarea
							id="videoDescription"
							value={videoDescription}
							onChange={(e) => setVideoDescription(e.target.value)}
							placeholder="Learn the fundamentals of React..."
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="passThreshold">Pass Threshold (out of {questions.length})</Label>
							<Input
								id="passThreshold"
								type="number"
								min="1"
								max={questions.length}
								value={passThreshold}
								onChange={(e) => setPassThreshold(Number(e.target.value))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="verificationCode">Verification Code</Label>
							<Input
								id="verificationCode"
								value={verificationCode}
								onChange={(e) => setVerificationCode(e.target.value)}
								placeholder="CERT-2024-001"
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="flex justify-between items-center">
							<Label>Quiz Questions ({questions.length}/10)</Label>
							<Button
								onClick={addQuestion}
								disabled={questions.length >= 10}
								size="sm"
								variant="outline"
							>
								Add Question
							</Button>
						</div>

						{questions.map((q, idx) => (
							<Card key={idx} className="bg-slate-800 border-slate-700">
								<CardHeader className="pb-3">
									<div className="flex justify-between items-center">
										<CardTitle className="text-sm">Question {idx + 1}</CardTitle>
										{questions.length > 1 && (
											<Button
												onClick={() => removeQuestion(idx)}
												size="sm"
												variant="ghost"
											>
												Remove
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="space-y-2">
										<Label>Question Text</Label>
										<Textarea
											value={q.text}
											onChange={(e) => updateQuestion(idx, "text", e.target.value)}
											placeholder="What is a React component?"
											rows={2}
										/>
									</div>
									<div className="space-y-2">
										<Label>Ideal Answer</Label>
										<Textarea
											value={q.idealAnswer}
											onChange={(e) => updateQuestion(idx, "idealAnswer", e.target.value)}
											placeholder="A React component is a reusable piece of UI that can manage its own state..."
											rows={3}
										/>
									</div>
								</CardContent>
							</Card>
						))}
					</div>

					<Button
						onClick={() => createTraining.mutate()}
						disabled={
							createTraining.isPending ||
							!videoTitle ||
							(!videoUrl && !videoFile) ||
							!videoDuration ||
							!verificationCode ||
							questions.filter((q) => q.text && q.idealAnswer).length === 0
						}
						className="w-full"
					>
						{createTraining.isPending ? "Creating..." : "Create Training Module"}
					</Button>
				</CardContent>
			</Card>

			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Existing Training Modules ({videos.length})</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{videos.map((video) => (
							<div key={video.id} className="flex justify-between items-center p-4 border rounded-lg">
								<div className="flex-1">
									<h3 className="font-semibold">{video.title}</h3>
									<p className="text-sm text-slate-600">{video.description}</p>
									<p className="text-xs text-slate-400 mt-1">Duration: {video.duration}s</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge>Active</Badge>
									<Button
										variant="destructive"
										size="sm"
										onClick={() => {
											if (confirm(`Delete "${video.title}"? This will also delete all associated questions and progress.`)) {
												deleteVideo.mutate(video.id);
											}
										}}
										disabled={deleteVideo.isPending}
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							</div>
						))}
						{videos.length === 0 && (
							<p className="text-center text-slate-500 py-8">No training modules yet</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ManageTestsPanel() {
	const [editingVideo, setEditingVideo] = useState<VideosModel | null>(null);
	const [editingQuestions, setEditingQuestions] = useState<QuestionsModel[]>([]);
	const [editingSession, setEditingSession] = useState<TrainingSessionsModel | null>(null);

	const queryClient = useQueryClient();
	const videosOrm = VideosORM.getInstance();
	const questionsOrm = QuestionsORM.getInstance();
	const sessionsOrm = TrainingSessionsORM.getInstance();

	const { data: videos = [] } = useQuery({
		queryKey: ["videos"],
		queryFn: () => videosOrm.getAllVideos(),
	});

	const { data: allSessions = [] } = useQuery({
		queryKey: ["sessions"],
		queryFn: () => sessionsOrm.getAllTrainingSessions(),
	});

	const loadTestForEditing = async (videoId: string) => {
		const [video] = await videosOrm.getVideosByIDs([videoId]);
		const questions = await questionsOrm.getQuestionsByVideoId(videoId);
		const sessions = await sessionsOrm.getTrainingSessionsByVideoId(videoId);

		setEditingVideo(video);
		setEditingQuestions(questions);
		setEditingSession(sessions[0] || null);
	};

	const updateTest = useMutation({
		mutationFn: async () => {
			if (!editingVideo || !editingSession) return;

			await videosOrm.setVideosById(editingVideo.id, editingVideo);
			await sessionsOrm.setTrainingSessionsById(editingSession.id, editingSession);

			// Update questions
			for (const question of editingQuestions) {
				await questionsOrm.setQuestionsById(question.id, question);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videos"] });
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
			setEditingVideo(null);
			setEditingQuestions([]);
			setEditingSession(null);
		},
	});

	const deleteVideo = useMutation({
		mutationFn: async (videoId: string) => {
			await videosOrm.deleteVideosByIDs([videoId]);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videos"] });
		},
	});

	if (editingVideo) {
		return (
			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Edit Test: {editingVideo.title}</CardTitle>
					<CardDescription className="text-slate-400">Update test questions and settings</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-4">
						<div className="space-y-2">
							<Label>Video Title</Label>
							<Input
								value={editingVideo.title}
								onChange={(e) =>
									setEditingVideo({ ...editingVideo, title: e.target.value })
								}
							/>
						</div>
						<div className="space-y-2">
							<Label>Description</Label>
							<Textarea
								value={editingVideo.description || ""}
								onChange={(e) =>
									setEditingVideo({ ...editingVideo, description: e.target.value })
								}
							/>
						</div>
						{editingSession && (
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Pass Threshold</Label>
									<Input
										type="number"
										value={editingSession.pass_threshold}
										onChange={(e) =>
											setEditingSession({
												...editingSession,
												pass_threshold: Number(e.target.value),
											})
										}
									/>
								</div>
								<div className="space-y-2">
									<Label>Verification Code</Label>
									<Input
										value={editingSession.verification_code || ""}
										onChange={(e) =>
											setEditingSession({
												...editingSession,
												verification_code: e.target.value,
											})
										}
									/>
								</div>
							</div>
						)}
					</div>

					<Separator />

					<div className="space-y-4">
						<Label>Questions</Label>
						{editingQuestions.map((question, idx) => (
							<Card key={question.id} className="bg-slate-800 border-slate-700">
								<CardHeader className="pb-3">
									<CardTitle className="text-sm">Question {idx + 1}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="space-y-2">
										<Label>Question Text</Label>
										<Textarea
											value={question.text}
											onChange={(e) => {
												const updated = [...editingQuestions];
												updated[idx] = { ...question, text: e.target.value };
												setEditingQuestions(updated);
											}}
											rows={2}
										/>
									</div>
									<div className="space-y-2">
										<Label>Ideal Answer</Label>
										<Textarea
											value={question.ideal_answer}
											onChange={(e) => {
												const updated = [...editingQuestions];
												updated[idx] = { ...question, ideal_answer: e.target.value };
												setEditingQuestions(updated);
											}}
											rows={3}
										/>
									</div>
								</CardContent>
							</Card>
						))}
					</div>

					<div className="flex gap-2">
						<Button onClick={() => updateTest.mutate()} disabled={updateTest.isPending}>
							{updateTest.isPending ? "Saving..." : "Save Changes"}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setEditingVideo(null);
								setEditingQuestions([]);
								setEditingSession(null);
							}}
						>
							Cancel
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="chatter-panel">
			<CardHeader>
				<CardTitle className="text-slate-100">Manage Tests ({videos.length})</CardTitle>
				<CardDescription className="text-slate-400">Edit or delete existing training tests</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{videos.map((video) => {
						const session = allSessions.find((s) => s.video_id === video.id);
						return (
							<div key={video.id} className="flex justify-between items-center p-4 border rounded-lg">
								<div className="flex-1">
									<h3 className="font-semibold">{video.title}</h3>
									<p className="text-sm text-slate-600">{video.description}</p>
									<div className="flex gap-4 mt-2">
										<p className="text-xs text-slate-400">Duration: {video.duration}s</p>
										{session && (
											<>
												<p className="text-xs text-slate-400">
													Pass: {session.pass_threshold}/{session.total_questions}
												</p>
												<p className="text-xs text-slate-400">Code: {session.verification_code}</p>
											</>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={() => loadTestForEditing(video.id)}>
										Edit
									</Button>
									<Button
										variant="destructive"
										size="sm"
										onClick={() => {
											if (
												confirm(
													`Delete "${video.title}"? This will also delete all associated questions and progress.`
												)
											) {
												deleteVideo.mutate(video.id);
											}
										}}
										disabled={deleteVideo.isPending}
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							</div>
						);
					})}
					{videos.length === 0 && <p className="text-center text-slate-500 py-8">No tests available</p>}
				</div>
			</CardContent>
		</Card>
	);
}

function ChatterFeedbackPanel() {
	const { data: payrollSnapshot } = useQuery({
		queryKey: ["payrollSnapshot"],
		queryFn: fetchPayrollSnapshot,
	});
	const employees = payrollSnapshot?.snapshot?.employees ?? [];
	const tosExemptUsers = useMemo(() => new Set(["bulze", "teddy"]), []);
	const chatEmployees = useMemo(
		() =>
			employees.filter((emp) => {
				const chat = emp.chat || {};
				return (chat.top_sentences?.length || 0) > 0 || (chat.top_baits?.length || 0) > 0;
			}),
		[employees],
	);

	const [selectedEmployeeName, setSelectedEmployeeName] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [feedbackByEmployee, setFeedbackByEmployee] = useState<Record<string, ChatFeedback>>({});
	const [loadingEmployee, setLoadingEmployee] = useState<string | null>(null);

	useEffect(() => {
		if (selectedEmployeeName || chatEmployees.length === 0) return;
		setSelectedEmployeeName(chatEmployees[0].employee);
	}, [selectedEmployeeName, chatEmployees]);

	const filteredEmployees = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return chatEmployees;
		return chatEmployees.filter((emp) => (emp.employee || "").toLowerCase().includes(q));
	}, [chatEmployees, search]);

	const topPeers = useMemo(() => {
		return [...chatEmployees]
			.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
			.slice(0, 3);
	}, [chatEmployees]);

	const selectedEmployee = selectedEmployeeName
		? chatEmployees.find((emp) => emp.employee === selectedEmployeeName) ?? null
		: null;

	const summarizeText = (text: string, limit = 160) => {
		const compact = (text || "").replace(/\s+/g, " ").trim();
		if (compact.length <= limit) return compact;
		return `${compact.slice(0, limit)}...`;
	};

	const readJsonResponse = async <T,>(response: Response) => {
		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("application/json")) {
			const text = await response.text();
			return { ok: false as const, status: response.status, text };
		}
		try {
			const json = (await response.json()) as T;
			return { ok: true as const, status: response.status, json };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid JSON response";
			return { ok: false as const, status: response.status, text: message };
		}
	};

	useEffect(() => {
		if (!selectedEmployee) return;
		if (feedbackByEmployee[selectedEmployee.employee]) return;

		let cancelled = false;
		const run = async () => {
			setLoadingEmployee(selectedEmployee.employee);
			try {
				const response = await fetch(`${PAYROLL_API_BASE}/api/chat-feedback`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						employee: selectedEmployee,
						top_peers: topPeers,
						ai_enabled: true,
					}),
				});
				const parsed = await readJsonResponse<ChatFeedback & { error?: string }>(response);
				if (!parsed.ok) {
					if (cancelled) return;
					setFeedbackByEmployee((prev) => ({
						...prev,
						[selectedEmployee.employee]: { error: summarizeText(parsed.text) },
					}));
					return;
				}
				if (!response.ok) {
					if (cancelled) return;
					setFeedbackByEmployee((prev) => ({
						...prev,
						[selectedEmployee.employee]: {
							error: summarizeText(parsed.json.error || "Failed to generate feedback."),
						},
					}));
					return;
				}
				if (cancelled) return;
				setFeedbackByEmployee((prev) => ({
					...prev,
					[selectedEmployee.employee]: parsed.json,
				}));
			} catch (error) {
				if (cancelled) return;
				setFeedbackByEmployee((prev) => ({
					...prev,
					[selectedEmployee.employee]: {
						error: error instanceof Error ? error.message : "Request failed",
					},
				}));
			} finally {
				if (!cancelled) setLoadingEmployee(null);
			}
		};

		run();
		return () => {
			cancelled = true;
		};
	}, [PAYROLL_API_BASE, feedbackByEmployee, selectedEmployee, topPeers]);

	const renderScore = (label: string, value?: number) => {
		const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
		return (
			<div className="space-y-1">
				<div className="flex items-center justify-between text-sm text-slate-300">
					<span>{label}</span>
					<span className="text-slate-200 font-medium">{safeValue}/100</span>
				</div>
				<Progress value={safeValue} />
			</div>
		);
	};

	if (!payrollSnapshot?.snapshot) {
		return (
			<Card className="chatter-panel mb-6">
				<CardHeader>
					<CardTitle className="text-slate-100">Feedback</CardTitle>
					<CardDescription className="text-slate-400">
						Upload the payroll Excel and chat report to generate chatter feedback.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-slate-400">
					No payroll snapshot found. Upload the Excel files in Payroll to continue.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="chatter-panel mb-6">
			<CardHeader>
				<CardTitle className="text-slate-100">Feedback</CardTitle>
				<CardDescription className="text-slate-400">
					AI feedback from chat message reports (Message Dashboard export).
				</CardDescription>
			</CardHeader>
			<CardContent className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
				<div className="space-y-3">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search chatter..."
					/>
					<div className="border border-slate-700 rounded-lg chatter-panel divide-y divide-slate-700 overflow-hidden">
						{filteredEmployees.map((emp) => {
							const active = emp.employee === selectedEmployeeName;
							const feedback = feedbackByEmployee[emp.employee];
							const isTosExempt = tosExemptUsers.has((emp.employee || "").toLowerCase().trim());
							const riskScore = isTosExempt ? 0 : Number(feedback?.risk_score ?? 0);
							return (
								<button
									key={emp.employee}
									type="button"
									onClick={() => setSelectedEmployeeName(emp.employee)}
									className={cn(
										"w-full text-left px-4 py-3 hover:bg-slate-800/60 transition flex items-center justify-between gap-3",
										active && "bg-slate-800/70",
									)}
								>
									<div className="min-w-0">
										<p className="text-slate-100 font-medium truncate">{emp.employee}</p>
										<p className="text-xs text-slate-400 truncate">
											Sales ${Number(emp.sales || 0).toFixed(0)}
										</p>
									</div>
									<Badge variant="outline" className="border-slate-700 text-slate-200">
										Risk {Number.isFinite(riskScore) ? riskScore : 0}
									</Badge>
								</button>
							);
						})}
						{chatEmployees.length === 0 && (
							<div className="px-4 py-6 text-center text-slate-500">
								No chat data found. Upload the Message Dashboard report in Payroll.
							</div>
						)}
						{chatEmployees.length > 0 && filteredEmployees.length === 0 && (
							<div className="px-4 py-6 text-center text-slate-500">No chatters match your search.</div>
						)}
					</div>
				</div>

				<div className="min-w-0">
					{!selectedEmployee && (
						<div className="text-slate-400 text-sm">Select a chatter to view feedback.</div>
					)}

					{selectedEmployee && (() => {
						const feedback = feedbackByEmployee[selectedEmployee.employee];
						const isLoading = loadingEmployee === selectedEmployee.employee;
						const isTosExempt = tosExemptUsers.has((selectedEmployee.employee || "").toLowerCase().trim());
						return (
							<Card className="chatter-panel">
								<CardHeader>
									<CardTitle className="text-slate-100">{selectedEmployee.employee}</CardTitle>
									<CardDescription className="text-slate-400">
										{isLoading ? "Generating feedback..." : "Chat performance overview"}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-6">
									{feedback?.error && (
										<Alert variant="destructive">
											<AlertDescription>{feedback.error}</AlertDescription>
										</Alert>
									)}

									{!feedback?.error && (
										<>
											{feedback?.summary && (
												<p className="text-slate-200">{feedback.summary}</p>
											)}

											<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
												{renderScore("Risk", isTosExempt ? 0 : feedback?.risk_score)}
												{renderScore("Greedy", feedback?.greedy_score)}
												{renderScore("Fantasy", feedback?.fantasy_score)}
											</div>

											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div className="space-y-2">
													<Label>Strengths</Label>
													<ul className="text-sm text-slate-300 list-disc pl-4 space-y-1">
														{(feedback?.strengths || []).map((item) => (
															<li key={item}>{item}</li>
														))}
														{(feedback?.strengths || []).length === 0 && <li>-</li>}
													</ul>
												</div>
												<div className="space-y-2">
													<Label>Improvements</Label>
													<ul className="text-sm text-slate-300 list-disc pl-4 space-y-1">
														{(feedback?.improvements || []).map((item) => (
															<li key={item}>{item}</li>
														))}
														{(feedback?.improvements || []).length === 0 && <li>-</li>}
													</ul>
												</div>
											</div>

											<div className="space-y-2">
												<Label>TOS Risk Checks</Label>
												<div className="flex flex-wrap gap-2">
													{isTosExempt ? (
														<span className="text-sm text-slate-400">No risk flags detected.</span>
													) : (
														<>
															{(feedback?.tos_flags || []).map((flag) => (
																<Badge key={flag} variant="secondary">
																	{flag}
																</Badge>
															))}
															{(feedback?.tos_flags || []).length === 0 && (
																<span className="text-sm text-slate-400">No risk flags detected.</span>
															)}
														</>
													)}
												</div>
											</div>
										</>
									)}
								</CardContent>
							</Card>
						);
					})()}
				</div>
			</CardContent>
		</Card>
	);
}

function UserApprovalsPanel() {
	const usersOrm = UsersORM.getInstance();
	const queryClient = useQueryClient();

	const { data: users = [] } = useQuery({
		queryKey: ["allUsers"],
		queryFn: () => usersOrm.getAllUsers(),
	});

	const updateUser = useMutation({
		mutationFn: async (user: UsersModel) => {
			await usersOrm.setUsersById(user.id, user);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["allUsers"] });
		},
	});

	const deleteUser = useMutation({
		mutationFn: async (userId: string) => {
			await usersOrm.deleteUsersByIDs([userId]);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["allUsers"] });
		},
	});

	const pending = users.filter((user) => !user.is_admin && !user.is_approved);
	const approved = users.filter((user) => !user.is_admin && user.is_approved);
	const approvedChatters = approved.filter((user) => (user.role || DEFAULT_ROLE) === "chatter");
	const approvedRecruits = approved.filter((user) => (user.role || DEFAULT_ROLE) !== "chatter");

	return (
		<div className="space-y-6">
			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Pending Approvals ({pending.length})</CardTitle>
					<CardDescription className="text-slate-400">Approve or reject new users</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{pending.map((user) => (
						<div key={user.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-slate-700 chatter-panel">
							<div>
								<p className="text-slate-100 font-medium">{user.name}</p>
								<p className="text-sm text-slate-400">{user.email}</p>
								<p className="text-xs text-slate-500">
									Discord: {user.discord_username || "—"} ({user.discord_nickname || "—"})
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									onClick={() => updateUser.mutate({ ...user, is_approved: true })}
									disabled={updateUser.isPending}
									className="bg-emerald-600 hover:bg-emerald-700"
								>
									Approve
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										if (confirm(`Remove "${user.name}"? This deletes the user record.`)) {
											deleteUser.mutate(user.id);
										}
									}}
									disabled={deleteUser.isPending}
								>
									Disapprove
								</Button>
							</div>
						</div>
					))}
					{pending.length === 0 && (
						<p className="text-center text-slate-500 py-6">No pending users</p>
					)}
				</CardContent>
			</Card>

			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Approved Chatters ({approvedChatters.length})</CardTitle>
					<CardDescription className="text-slate-400">Manage approved chatter access</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{approvedChatters.map((user) => (
						<div key={user.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-slate-700 chatter-panel">
							<div>
								<p className="text-slate-100 font-medium">{user.name}</p>
								<p className="text-sm text-slate-400">{user.email}</p>
								<p className="text-xs text-slate-500">
									Role: {user.role || DEFAULT_ROLE} | Inflow: {user.inflow_username || "—"}
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => updateUser.mutate({ ...user, is_approved: false })}
									disabled={updateUser.isPending}
								>
									Disable Access
								</Button>
							</div>
						</div>
					))}
					{approvedChatters.length === 0 && (
						<p className="text-center text-slate-500 py-6">No approved chatters yet</p>
					)}
				</CardContent>
			</Card>

			<Card className="chatter-panel">
				<CardHeader>
					<CardTitle className="text-slate-100">Approved Recruits ({approvedRecruits.length})</CardTitle>
					<CardDescription className="text-slate-400">Manage approved recruit access</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{approvedRecruits.map((user) => (
						<div key={user.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-slate-700 chatter-panel">
							<div>
								<p className="text-slate-100 font-medium">{user.name}</p>
								<p className="text-sm text-slate-400">{user.email}</p>
								<p className="text-xs text-slate-500">
									Role: {user.role || DEFAULT_ROLE} | Inflow: {user.inflow_username || "N/A"}
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => updateUser.mutate({ ...user, is_approved: false })}
									disabled={updateUser.isPending}
								>
									Disable Access
								</Button>
							</div>
						</div>
					))}
					{approvedRecruits.length === 0 && (
						<p className="text-center text-slate-500 py-6">No approved recruits yet</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function PayrollPanel() {
	const [salesFile, setSalesFile] = useState<File | null>(null);
	const [chatFile, setChatFile] = useState<File | null>(null);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [dateFilterTouched, setDateFilterTouched] = useState(false);
	const [allowDateFilter, setAllowDateFilter] = useState(false);
	const [minDate, setMinDate] = useState("");
	const [maxDate, setMaxDate] = useState("");
	const [defaultPercent, setDefaultPercent] = useState(9);
	const [aiEnabled, setAiEnabled] = useState(false);
	const [status, setStatus] = useState("Ready");
	const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
	const [selectedEmployeeName, setSelectedEmployeeName] = useState<string | null>(null);
	const [detailPercent, setDetailPercent] = useState("");
	const [ppvDay, setPpvDay] = useState<PayrollPpvDay>({});
	const [activeTab, setActiveTab] = useState<"detail" | "ppv">("detail");
	const [employeeSearch, setEmployeeSearch] = useState("");
	const [showAllEmployees, setShowAllEmployees] = useState(false);
	const [updatedAt, setUpdatedAt] = useState<string | null>(null);
	const [aiStatus, setAiStatus] = useState<string | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [percentOverrides, setPercentOverrides] = useState<Record<string, number>>({});
	const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
	const usersOrm = UsersORM.getInstance();

	const formatApiErrorMessage = (label: string, error: unknown) => {
		const message =
			typeof error === "string"
				? error
				: error instanceof Error
					? error.message
					: "Unknown error";
		const origin = typeof window === "undefined" ? "" : window.location.origin;
		const corsHint = origin ? ` If you set CORS_ORIGINS on Render, include ${origin}.` : "";
		return `${label}: ${message}. ${PAYROLL_API_HINT}${corsHint}`;
	};

	const readJsonResponse = async <T,>(response: Response) => {
		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("application/json")) {
			const text = await response.text();
			return { ok: false as const, status: response.status, text };
		}
		try {
			const json = (await response.json()) as T;
			return { ok: true as const, status: response.status, json };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid JSON response";
			return { ok: false as const, status: response.status, text: message };
		}
	};

	const summarizeText = (text: string, limit = 180) => {
		const compact = (text || "").replace(/\s+/g, " ").trim();
		if (compact.length <= limit) return compact;
		return `${compact.slice(0, limit)}…`;
	};

	const applySnapshot = (snapshot: PayrollSnapshot, updatedAtIso: string | null) => {
		setEmployees(Array.isArray(snapshot.employees) ? snapshot.employees : []);
		setMinDate(snapshot.min_date || "");
		setMaxDate(snapshot.max_date || "");
		setPpvDay(snapshot.ppv_day || {});
		setAiStatus(snapshot.ai_status || null);
		setUpdatedAt(updatedAtIso);
		setDateFrom((prev) => prev || snapshot.min_date || "");
		setDateTo((prev) => prev || snapshot.max_date || "");
		setAllowDateFilter(true);
	};

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				setStatus("Loading stored payroll...");
				const stored = await fetchPayrollSnapshot();
				const storedOverrides = await fetchPayrollPercentOverrides();
				if (cancelled) return;
				setPercentOverrides(storedOverrides.overrides);
				if (stored.snapshot) {
					applySnapshot(stored.snapshot, stored.updatedAt);
					setStatus("Loaded stored payroll.");
					return;
				}
				setStatus("Ready");
			} catch {
				if (!cancelled) setStatus("Ready");
			}
		};
		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const buildCurrentSnapshot = (nextEmployees?: PayrollEmployee[]): PayrollSnapshot | null => {
		const employeesToSave = nextEmployees ?? employees;
		if (!employeesToSave.length || !minDate || !maxDate) return null;
		return {
			min_date: minDate,
			max_date: maxDate,
			employees: employeesToSave,
			ai_status: aiStatus || undefined,
			ppv_day: ppvDay,
		};
	};

	const persistSnapshot = async (nextEmployees?: PayrollEmployee[]) => {
		const snapshot = buildCurrentSnapshot(nextEmployees);
		if (!snapshot) return;
		const updatedIso = await savePayrollSnapshot(snapshot);
		setUpdatedAt(updatedIso);
	};

	const computeShiftBonus = (value: number) => {
		if (!Number.isFinite(value) || value <= 0) return 0;
		return Math.floor(value / 500) * 15;
	};

	const buildDailySalesMap = (emp: PayrollEmployee) => {
		const map = new Map<string, number>();
		const daily = emp.daily_sales ?? {};
		if (Object.keys(daily).length > 0) {
			for (const [dateKeyRaw, value] of Object.entries(daily)) {
				const dateKey = String(dateKeyRaw || "").slice(0, 10);
				if (!dateKey) continue;
				map.set(dateKey, (map.get(dateKey) ?? 0) + Number(value ?? 0));
			}
			return map;
		}
		const shifts = emp.shifts ?? [];
		for (const shift of shifts) {
			const dateKey = String(shift.date || "").slice(0, 10);
			if (!dateKey) continue;
			map.set(dateKey, (map.get(dateKey) ?? 0) + Number(shift.sales ?? 0));
		}
		return map;
	};

	const buildDailyBonusMap = (emp: PayrollEmployee, salesMap: Map<string, number>) => {
		const map = new Map<string, number>();
		const daily = emp.daily_bonus ?? {};
		if (Object.keys(daily).length > 0) {
			for (const [dateKeyRaw, value] of Object.entries(daily)) {
				const dateKey = String(dateKeyRaw || "").slice(0, 10);
				if (!dateKey) continue;
				map.set(dateKey, (map.get(dateKey) ?? 0) + Number(value ?? 0));
			}
			return map;
		}
		for (const [dateKey, sales] of salesMap.entries()) {
			map.set(dateKey, computeShiftBonus(sales));
		}
		return map;
	};

	const buildMonthlySalesMap = (salesMap: Map<string, number>) => {
		const monthMap = new Map<string, number>();
		for (const [dateKey, value] of salesMap.entries()) {
			let date: Date | null = null;
			try {
				date = parseISO(dateKey);
			} catch {
				date = null;
			}
			if (!date) continue;
			const monthKey = format(startOfMonth(date), "yyyy-MM");
			monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + value);
		}
		return monthMap;
	};

	const employeeDailyMaps = useMemo(() => {
		return employees.map((emp) => {
			const salesMap = buildDailySalesMap(emp);
			const bonusMap = buildDailyBonusMap(emp, salesMap);
			const monthlySalesMap = buildMonthlySalesMap(salesMap);
			return { employee: emp.employee, salesMap, bonusMap, monthlySalesMap };
		});
	}, [employees]);

	const statsByEmployee = useMemo(() => {
		return new Map(employeeDailyMaps.map((entry) => [entry.employee, entry]));
	}, [employeeDailyMaps]);

	const payrollDateRange = useMemo(() => {
		let min: Date | null = null;
		let max: Date | null = null;
		for (const entry of employeeDailyMaps) {
			for (const dateKey of entry.salesMap.keys()) {
				let date: Date | null = null;
				try {
					date = parseISO(dateKey);
				} catch {
					date = null;
				}
				if (!date) continue;
				if (!min || date < min) min = date;
				if (!max || date > max) max = date;
			}
		}
		if (!min && minDate) {
			try {
				min = parseISO(minDate);
			} catch {
				min = null;
			}
		}
		if (!max && maxDate) {
			try {
				max = parseISO(maxDate);
			} catch {
				max = null;
			}
		}
		return { min, max };
	}, [employeeDailyMaps, minDate, maxDate]);

	const payPeriods = useMemo(() => {
		if (!payrollDateRange.min || !payrollDateRange.max) return [];
		const PERIOD_DAYS = 14;
		let start = payrollDateRange.min;
		while (getDay(start) !== 5) start = subDays(start, 1);
		const last = payrollDateRange.max;
		const periods: Array<{ start: Date; endExclusive: Date; key: string }> = [];
		while (start <= addDays(last, 1)) {
			const endExclusive = addDays(start, PERIOD_DAYS);
			const key = `${format(start, "yyyy-MM-dd")}__${format(endExclusive, "yyyy-MM-dd")}`;
			periods.push({ start, endExclusive, key });
			start = endExclusive;
		}
		return periods;
	}, [payrollDateRange]);

	const currentCutIndex = useMemo(() => {
		if (!payPeriods.length) return -1;
		let reference: Date | null = null;
		if (maxDate) {
			try {
				reference = parseISO(maxDate);
			} catch {
				reference = null;
			}
		}
		if (!reference) reference = payrollDateRange.max;
		if (!reference) return payPeriods.length - 1;
		const idx = payPeriods.findIndex((p) => reference && reference >= p.start && reference < p.endExclusive);
		return idx >= 0 ? idx : payPeriods.length - 1;
	}, [payPeriods, maxDate, payrollDateRange]);

	useEffect(() => {
		if (!payPeriods.length) {
			setSelectedCutIndex(null);
			return;
		}
		setSelectedCutIndex((prev) => {
			if (prev === null || prev < 0 || prev >= payPeriods.length) return currentCutIndex;
			return prev;
		});
	}, [payPeriods, currentCutIndex]);

	const selectedPeriod = useMemo(() => {
		if (selectedCutIndex === null) return null;
		return payPeriods[selectedCutIndex] ?? null;
	}, [payPeriods, selectedCutIndex]);

	const isBulzeInPayroll = useMemo(
		() => employees.some((emp) => normalizeName(emp.employee) === "bulze"),
		[employees],
	);

	const { data: allUsers = [] } = useQuery({
		queryKey: ["payrollAllUsers"],
		queryFn: () => usersOrm.getAllUsers(),
	});
	const allUserIds = useMemo(() => allUsers.map((u) => u.id).sort().join("|"), [allUsers]);
	const { data: bulzeShareMeta = [] } = useQuery({
		queryKey: ["payrollBulzeShareMeta", allUserIds],
		enabled: allUsers.length > 0,
		queryFn: async () => {
			const base = allUsers.filter((u) => !u.is_admin);
			const results = await Promise.all(
				base.map(async (u) => {
					try {
						const response = await fetchChatterAdminMeta(u.id);
						return { user: u, meta: response.meta };
					} catch {
						return { user: u, meta: null };
					}
				}),
			);
			return results;
		},
	});

	const bulzeAssignedUsers = useMemo(() => {
		const fallbackNames = new Set(BULZE_DEFAULT_NAMES);
		return bulzeShareMeta.filter(({ user: rowUser, meta }) => {
			const explicit = meta?.bulze_share;
			if (explicit === true) return true;
			if (explicit === false) return false;
			const name = normalizeName(rowUser.name);
			const inflowName = normalizeName(rowUser.inflow_username);
			return (name && fallbackNames.has(name)) || (inflowName && fallbackNames.has(inflowName));
		});
	}, [bulzeShareMeta]);

	const payrollByName = useMemo(() => {
		const map = new Map<string, PayrollEmployee>();
		for (const emp of employees) {
			const key = normalizeName(emp.employee);
			if (key && !map.has(key)) map.set(key, emp);
		}
		return map;
	}, [employees]);

	const bulzeShareByMonth = useMemo(() => {
		if (!isBulzeInPayroll || bulzeAssignedUsers.length === 0) return new Map<string, number>();
		const map = new Map<string, number>();
		for (const { user: rowUser } of bulzeAssignedUsers) {
			const inflowName = normalizeName(rowUser.inflow_username);
			const name = normalizeName(rowUser.name);
			const employeeMatch = (inflowName && payrollByName.get(inflowName))
				|| (name && payrollByName.get(name))
				|| null;
			if (!employeeMatch) continue;
			const stats = statsByEmployee.get(employeeMatch.employee);
			if (!stats) continue;
			for (const [monthKey, value] of stats.monthlySalesMap.entries()) {
				map.set(monthKey, (map.get(monthKey) ?? 0) + value * 0.01);
			}
		}
		return map;
	}, [isBulzeInPayroll, bulzeAssignedUsers, payrollByName, statsByEmployee]);

	const loginStreakByName = useMemo(() => {
		const map = new Map<string, number>();
		for (const entry of bulzeShareMeta) {
			const streak = Number(entry.meta?.login_streak ?? 0);
			if (!streak) continue;
			const nameKey = normalizeName(entry.user.name);
			const inflowKey = normalizeName(entry.user.inflow_username);
			if (nameKey) map.set(nameKey, streak);
			if (inflowKey) map.set(inflowKey, streak);
		}
		return map;
	}, [bulzeShareMeta]);

	const computedEmployees = useMemo(() => {
		return employees.map((emp) => {
			const percent = Number(emp.percent ?? defaultPercent / 100);
			const fallbackSales = Number(emp.sales ?? 0);
			const fallbackBonus = Number(emp.bonus ?? 0);
			const fallbackBasePay = fallbackSales * percent;
			const fallbackTotalPay = fallbackBasePay + fallbackBonus;

			if (!selectedPeriod) {
				return {
					...emp,
					percent,
					basePay: fallbackBasePay,
					totalPay: fallbackTotalPay,
					cutSales: fallbackSales,
					cutBonus: fallbackBonus,
				};
			}

			const stats = statsByEmployee.get(emp.employee);
			if (!stats) {
				return {
					...emp,
					percent,
					basePay: fallbackBasePay,
					totalPay: fallbackTotalPay,
					cutSales: fallbackSales,
					cutBonus: fallbackBonus,
				};
			}

			let cutSales = 0;
			let cutBonus = 0;
			for (const [dateKey, value] of stats.salesMap.entries()) {
				let date: Date | null = null;
				try {
					date = parseISO(dateKey);
				} catch {
					date = null;
				}
				if (!date || date < selectedPeriod.start || date >= selectedPeriod.endExclusive) continue;
				cutSales += value;
			}
			for (const [dateKey, value] of stats.bonusMap.entries()) {
				let date: Date | null = null;
				try {
					date = parseISO(dateKey);
				} catch {
					date = null;
				}
				if (!date || date < selectedPeriod.start || date >= selectedPeriod.endExclusive) continue;
				cutBonus += value;
			}

			let performanceBonus = 0;
			const monthStartCandidate = startOfMonth(selectedPeriod.endExclusive);
			if (monthStartCandidate > selectedPeriod.start && monthStartCandidate < selectedPeriod.endExclusive) {
				const prevMonthStart = startOfMonth(subMonths(monthStartCandidate, 1));
				const prevMonthKey = format(prevMonthStart, "yyyy-MM");
				const prevSales = stats.monthlySalesMap.get(prevMonthKey) ?? 0;
				if (prevSales > 10000) {
					const units = Math.floor((prevSales - 1) / 10000);
					performanceBonus = units * 250;
				}
			}

			let bulzeShareBonus = 0;
			if (normalizeName(emp.employee) === "bulze") {
				const monthStartCandidate = startOfMonth(selectedPeriod.endExclusive);
				if (monthStartCandidate > selectedPeriod.start && monthStartCandidate < selectedPeriod.endExclusive) {
					const prevMonthStart = startOfMonth(subMonths(monthStartCandidate, 1));
					const prevMonthKey = format(prevMonthStart, "yyyy-MM");
					bulzeShareBonus = bulzeShareByMonth.get(prevMonthKey) ?? 0;
				}
			}

			const totalBonus = cutBonus + performanceBonus + bulzeShareBonus;
			const basePay = cutSales * percent;
			const totalPay = basePay + totalBonus;
			return {
				...emp,
				percent,
				basePay,
				totalPay,
				cutSales,
				cutBonus: totalBonus,
			};
		});
	}, [employees, defaultPercent, selectedPeriod, statsByEmployee, bulzeShareByMonth]);

	const totals = useMemo(() => {
		return computedEmployees.reduce(
			(acc, emp) => {
				acc.sales += Number(emp.cutSales ?? emp.sales ?? 0);
				acc.bonus += Number(emp.cutBonus ?? emp.bonus ?? 0);
				acc.total += Number(emp.totalPay ?? 0);
				return acc;
			},
			{ sales: 0, bonus: 0, total: 0 },
		);
	}, [computedEmployees]);

	const sortedEmployees = useMemo(() => {
		return [...computedEmployees].sort((a, b) => (b.totalPay ?? 0) - (a.totalPay ?? 0));
	}, [computedEmployees]);

	const filteredEmployees = useMemo(() => {
		const query = employeeSearch.trim().toLowerCase();
		if (!query) return sortedEmployees;
		return sortedEmployees.filter((emp) => emp.employee.toLowerCase().includes(query));
	}, [sortedEmployees, employeeSearch]);

	const visibleEmployees = useMemo(() => {
		if (showAllEmployees) return filteredEmployees;
		return filteredEmployees.slice(0, 7);
	}, [filteredEmployees, showAllEmployees]);

	const selectedEmployee = useMemo(() => {
		if (!selectedEmployeeName) return null;
		return computedEmployees.find((emp) => emp.employee === selectedEmployeeName) || null;
	}, [computedEmployees, selectedEmployeeName]);

	const selectedCutLabel = useMemo(() => {
		if (!selectedPeriod) return "No cut selected";
		return `Cut ${format(selectedPeriod.start, "MMM d, yyyy")} to ${format(subDays(selectedPeriod.endExclusive, 1), "MMM d, yyyy")}`;
	}, [selectedPeriod]);

	const selectedEmployeeDaily = useMemo(() => {
		if (!selectedEmployee || !selectedPeriod) return [];
		const stats = statsByEmployee.get(selectedEmployee.employee);
		if (!stats) return [];
		const entries: Array<{ date: Date; dateKey: string; sales: number; bonus: number; earned: number }> = [];
		for (const [dateKey, sales] of stats.salesMap.entries()) {
			let date: Date | null = null;
			try {
				date = parseISO(dateKey);
			} catch {
				date = null;
			}
			if (!date || date < selectedPeriod.start || date >= selectedPeriod.endExclusive) continue;
			const bonus = stats.bonusMap.get(dateKey) ?? 0;
			const earned = Number(sales || 0) * Number(selectedEmployee.percent ?? 0) + Number(bonus || 0);
			entries.push({ date, dateKey, sales, bonus, earned });
		}
		entries.sort((a, b) => a.date.getTime() - b.date.getTime());
		return entries;
	}, [selectedEmployee, selectedPeriod, statsByEmployee]);

	const bulzeCutShareTotal = useMemo(() => {
		if (!selectedPeriod) return 0;
		const monthStartCandidate = startOfMonth(selectedPeriod.endExclusive);
		if (monthStartCandidate <= selectedPeriod.start || monthStartCandidate >= selectedPeriod.endExclusive) {
			return 0;
		}
		const prevMonthStart = startOfMonth(subMonths(monthStartCandidate, 1));
		const prevMonthKey = format(prevMonthStart, "yyyy-MM");
		return bulzeShareByMonth.get(prevMonthKey) ?? 0;
	}, [selectedPeriod, bulzeShareByMonth]);

	const bulzeCutShareDetails = useMemo(() => {
		if (!selectedPeriod || bulzeAssignedUsers.length === 0) return [];
		const monthStartCandidate = startOfMonth(selectedPeriod.endExclusive);
		if (monthStartCandidate <= selectedPeriod.start || monthStartCandidate >= selectedPeriod.endExclusive) {
			return [];
		}
		const prevMonthStart = startOfMonth(subMonths(monthStartCandidate, 1));
		const prevMonthKey = format(prevMonthStart, "yyyy-MM");
		const results = bulzeAssignedUsers.map(({ user: rowUser }) => {
			const inflowName = normalizeName(rowUser.inflow_username);
			const name = normalizeName(rowUser.name);
			const employeeMatch = (inflowName && payrollByName.get(inflowName))
				|| (name && payrollByName.get(name))
				|| null;
			const monthlySales = employeeMatch
				? statsByEmployee.get(employeeMatch.employee)?.monthlySalesMap.get(prevMonthKey) ?? 0
				: 0;
			return {
				user: rowUser,
				monthlySales,
				share: monthlySales * 0.01,
			};
		});
		return results.filter((row) => row.monthlySales > 0).sort((a, b) => b.monthlySales - a.monthlySales);
	}, [selectedPeriod, bulzeAssignedUsers, payrollByName, statsByEmployee]);

	useEffect(() => {
		if (!selectedEmployee) return;
		const percentValue = Number(selectedEmployee.percent ?? defaultPercent / 100) * 100;
		setDetailPercent(percentValue.toFixed(2));
	}, [selectedEmployee, defaultPercent]);

	const formatMoney = (value: unknown) => {
		const amount = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(amount)) return "$0.00";
		return `$${amount.toFixed(2)}`;
	};
	const renderPpvList = (items?: PayrollPpvItem[]) => {
		if (!items || !items.length) {
			return <li>-</li>;
		}
		return items.map((item) => (
			<li key={`${item.text}-${item.count ?? 0}`}>
				{item.text} (purchases {item.purchased ?? 0}, offers {item.count ?? 0})
			</li>
		));
	};

	const handleAnalyze = async () => {
		if (isAnalyzing) return;
		if (!salesFile) {
			setStatus("Select a sales Excel file.");
			return;
		}

		const formData = new FormData();
		formData.append("file", salesFile);
		if (chatFile) {
			formData.append("chat_file", chatFile);
		}
		if (dateFilterTouched && allowDateFilter) {
			if (dateFrom) formData.append("date_from", dateFrom);
			if (dateTo) formData.append("date_to", dateTo);
		}
		formData.append("ai_enabled", aiEnabled ? "true" : "false");

		const controller = new AbortController();
		const abortTimer = window.setTimeout(() => controller.abort(), 10 * 60_000);
		const startMs = Date.now();
		const statusTimer = window.setInterval(() => {
			const elapsed = Math.round((Date.now() - startMs) / 1000);
			setStatus(
				aiEnabled
					? `Loading with AI enabled… (${elapsed}s)`
					: `Loading… (${elapsed}s)`,
			);
		}, 5000);

		setIsAnalyzing(true);
		setStatus(aiEnabled ? "Loading with AI enabled…" : "Loading…");

		try {
			const response = await fetch(`${PAYROLL_API_BASE}/api/analyze`, {
				method: "POST",
				body: formData,
				signal: controller.signal,
			});

			const parsed = await readJsonResponse<PayrollSnapshot & { error?: string }>(response);
			if (!parsed.ok) {
				setStatus(
					`Payroll analyze failed (${parsed.status}): ${summarizeText(parsed.text)}. ${PAYROLL_API_HINT}`,
				);
				return;
			}
			const data = parsed.json;
			if (!response.ok) {
				setStatus(data.error || `Failed to analyze file. ${PAYROLL_API_HINT}`);
				return;
			}

			setMinDate(data.min_date || "");
			setMaxDate(data.max_date || "");
			// Default to full range after each upload unless the admin explicitly filtered.
			if (!dateFilterTouched) {
				setDateFrom(data.min_date || "");
				setDateTo(data.max_date || "");
			}

			const percentValue = Number(defaultPercent) || 9;
			const percentByEmployee = new Map<string, number>();
			for (const existing of employees) {
				const key = (existing.employee || "").toLowerCase().trim();
				if (!key) continue;
				const existingPercent = Number(existing.percent);
				if (Number.isFinite(existingPercent)) {
					percentByEmployee.set(key, existingPercent);
				}
			}
			for (const [key, value] of Object.entries(percentOverrides)) {
				const percentOverride = Number(value);
				if (Number.isFinite(percentOverride)) {
					percentByEmployee.set(key, percentOverride);
				}
			}
			const preparedEmployees = (data.employees || []).map((emp) => {
				const key = (emp.employee || "").toLowerCase().trim();
				const overridePercent = key ? percentByEmployee.get(key) : undefined;
				const percent = Number.isFinite(overridePercent) ? overridePercent : percentValue / 100;
				return {
					...emp,
					percent,
					penalty: 0,
				};
			});

			setEmployees(preparedEmployees);
			setPpvDay(data.ppv_day || {});
			setAiStatus(data.ai_status || null);
			setEmployeeSearch("");
			setShowAllEmployees(false);
			setDateFilterTouched(false);
			setAllowDateFilter(true);
			setSelectedEmployeeName(null);
			setActiveTab("detail");

			const updatedIso = await savePayrollSnapshot({
				...data,
				employees: preparedEmployees,
			});
			setUpdatedAt(updatedIso);

			if (data.ai_status === "enabled") {
				setStatus(`Calculated (${preparedEmployees.length} employees). AI coaching loads on click.`);
			} else if (data.ai_status === "no_key") {
				setStatus(`Calculated (${preparedEmployees.length} employees). AI disabled (missing key).`);
			} else {
				setStatus(`Calculated. Employees: ${preparedEmployees.length}.`);
			}
		} catch (error) {
			setStatus(formatApiErrorMessage("Request failed", error));
		} finally {
			window.clearTimeout(abortTimer);
			window.clearInterval(statusTimer);
			setIsAnalyzing(false);
		}
	};

	const handleDefaultPercentChange = (value: number) => {
		setDefaultPercent(value);
		if (Number.isNaN(value)) return;
		const nextEmployees = employees.map((emp) => ({
			...emp,
			percent: value / 100,
		}));
		setEmployees(nextEmployees);
		persistSnapshot(nextEmployees).catch(() => {});
		if (selectedEmployeeName) {
			setDetailPercent(value.toFixed(2));
		}
	};

	const handleApply = () => {
		if (!selectedEmployeeName) return;
		const percentValue = parseFloat(detailPercent);
		if (!Number.isNaN(percentValue)) {
			const key = selectedEmployeeName.toLowerCase().trim();
			if (key) {
				const nextOverrides = { ...percentOverrides, [key]: percentValue / 100 };
				setPercentOverrides(nextOverrides);
				savePayrollPercentOverrides(nextOverrides).catch(() => {});
			}
		}
		const nextEmployees = employees.map((emp) => {
			if (emp.employee !== selectedEmployeeName) return emp;
			return {
				...emp,
				percent: Number.isNaN(percentValue) ? emp.percent : percentValue / 100,
			};
		});
		setEmployees(nextEmployees);
		persistSnapshot(nextEmployees).catch(() => {});
	};

	const handleAiTest = async () => {
		setStatus("Testing AI...");
		try {
			const response = await fetch(`${PAYROLL_API_BASE}/api/ai-test`, { method: "POST" });
			const parsed = await readJsonResponse<{ ok?: boolean; error?: string }>(response);
			if (!parsed.ok) {
				setStatus(
					`AI test failed (${parsed.status}): ${summarizeText(parsed.text)}. ${PAYROLL_API_HINT}`,
				);
				return;
			}
			const data = parsed.json;
			if (!response.ok || !data.ok) {
				setStatus(`AI test failed: ${data.error || "unknown error"}`);
				return;
			}
			setStatus("AI test OK.");
		} catch (error) {
			setStatus(formatApiErrorMessage("AI test failed", error));
		}
	};

	const clearSnapshot = () => {
		clearPayrollSnapshot().catch(() => {});
		setEmployees([]);
		setSelectedEmployeeName(null);
		setPpvDay({});
		setUpdatedAt(null);
		setAiStatus(null);
		setEmployeeSearch("");
		setShowAllEmployees(false);
		setStatus("Cleared.");
		setActiveTab("detail");
	};

	return (
		<div className="payroll-app">
			<header className="header">
				<div>
					<h1>Payroll Studio</h1>
					<p>Modern payroll analytics for chatter teams.</p>
				</div>
				<div className="status">{status || "Ready"}</div>
			</header>

			<section className="panel controls">
				<div className="field wide">
					<label>Sales Excel</label>
					<div className="file-row">
						<input
							type="file"
							accept=".xlsx,.xlsm,.xltx,.xltm"
							onChange={(e) => {
								setSalesFile(e.target.files?.[0] || null);
								setDateFilterTouched(false);
								setAllowDateFilter(false);
							}}
						/>
						<button type="button" className="btn accent" onClick={handleAnalyze} disabled={isAnalyzing}>
							{isAnalyzing ? "Loading…" : "Load + Calculate"}
						</button>
					</div>
				</div>
				<div className="field wide">
					<label>Chats Excel (optional)</label>
					<div className="file-row">
						<input
							type="file"
							accept=".xlsx,.xlsm,.xltx,.xltm"
							onChange={(e) => setChatFile(e.target.files?.[0] || null)}
						/>
					</div>
				</div>
				<div className="field">
					<label>Date from</label>
					<input
						type="date"
						min={minDate || undefined}
						max={maxDate || undefined}
						value={dateFrom}
						onChange={(e) => {
							setDateFrom(e.target.value);
							setDateFilterTouched(true);
						}}
					/>
				</div>
				<div className="field">
					<label>Date to</label>
					<input
						type="date"
						min={minDate || undefined}
						max={maxDate || undefined}
						value={dateTo}
						onChange={(e) => {
							setDateTo(e.target.value);
							setDateFilterTouched(true);
						}}
					/>
				</div>
				<div className="field wide">
					<label>Cut</label>
					<div className="file-row">
						<select
							value={selectedCutIndex ?? ""}
							onChange={(e) => {
								const nextValue = Number(e.target.value);
								setSelectedCutIndex(Number.isNaN(nextValue) ? null : nextValue);
							}}
							disabled={payPeriods.length === 0}
						>
							{payPeriods.length === 0 && <option value="">No cuts available</option>}
							{payPeriods.map((period, index) => {
								const label = `Cut ${format(period.start, "MMM d, yyyy")} to ${format(subDays(period.endExclusive, 1), "MMM d, yyyy")}`;
								return (
									<option key={period.key} value={index}>
										{index === currentCutIndex ? `${label} (current)` : label}
									</option>
								);
							})}
						</select>
						<button
							type="button"
							className="btn ghost"
							onClick={() => setSelectedCutIndex((prev) => (prev === null ? prev : Math.max(0, prev - 1)))}
							disabled={selectedCutIndex === null || selectedCutIndex <= 0}
						>
							Prev
						</button>
						<button
							type="button"
							className="btn ghost"
							onClick={() => setSelectedCutIndex((prev) => {
								if (prev === null) return prev;
								return Math.min(payPeriods.length - 1, prev + 1);
							})}
							disabled={selectedCutIndex === null || selectedCutIndex >= payPeriods.length - 1}
						>
							Next
						</button>
					</div>
				</div>
				<div className="field">
					<label>Default %</label>
					<input
						type="number"
						value={defaultPercent}
						min={0}
						step={0.1}
						onChange={(e) => handleDefaultPercentChange(Number(e.target.value))}
					/>
				</div>
				<div className="field actions">
					<label>AI Insights</label>
					<div className="ai-row">
						<label className="switch">
							<input
								type="checkbox"
								checked={aiEnabled}
								onChange={(e) => setAiEnabled(e.target.checked)}
							/>
							<span className="slider" />
						</label>
						<button type="button" className="btn pink" onClick={handleAiTest}>
							Test AI
						</button>
					</div>
				</div>
				<div className="field actions">
					<button type="button" className="btn ghost" onClick={clearSnapshot}>
						Clear
					</button>
				</div>
			</section>

			<section className="summary">
				<div className="card">
					<span>Total sales</span>
					<strong>{formatMoney(totals.sales)}</strong>
				</div>
				<div className="card">
					<span>Total bonus</span>
					<strong>{formatMoney(totals.bonus)}</strong>
				</div>
				<div className="card">
					<span>Total payout</span>
					<strong>{formatMoney(totals.total)}</strong>
				</div>
			</section>

			<div className="main-tabs">
				<button
					type="button"
					className={cn("tab-btn", activeTab === "detail" && "active")}
					onClick={() => setActiveTab("detail")}
				>
					Chatter detail
				</button>
				<button
					type="button"
					className={cn("tab-btn", activeTab === "ppv" && "active")}
					onClick={() => setActiveTab("ppv")}
				>
					PPV of the day
				</button>
			</div>

			<section className={cn("panel grid tab-panel", activeTab === "detail" && "active")}>
				<div className="table-wrap">
					<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
						<div className="flex items-center gap-2">
							<input
								type="text"
								placeholder="Search user…"
								value={employeeSearch}
								onChange={(e) => setEmployeeSearch(e.target.value)}
							/>
							<span className="text-xs text-slate-400">
								Showing {visibleEmployees.length}/{filteredEmployees.length}
							</span>
						</div>
						<button
							type="button"
							className="btn ghost"
							onClick={() => setShowAllEmployees((prev) => !prev)}
							disabled={filteredEmployees.length <= 7}
						>
							{showAllEmployees ? "Show top 7" : `Show all users (${filteredEmployees.length})`}
						</button>
						<div className="text-xs text-slate-400">{selectedCutLabel}</div>
						<button
							type="button"
							className="btn ghost"
							onClick={() => setSelectedCutIndex((prev) => (prev === null ? prev : Math.max(0, prev - 1)))}
							disabled={selectedCutIndex === null || selectedCutIndex <= 0}
						>
							Prev cut
						</button>
					</div>
					<table>
						<thead>
							<tr>
								<th>Employee</th>
								<th>Percent</th>
								<th>Sales</th>
								<th>Bonus</th>
								<th>Base Pay</th>
								<th>Total Pay</th>
							</tr>
						</thead>
						<tbody>
							{visibleEmployees.map((emp) => (
								<tr key={emp.employee} onClick={() => setSelectedEmployeeName(emp.employee)}>
									<td>
										<div className="flex items-center gap-2">
											<span>{emp.employee}</span>
											{(() => {
												const streak = loginStreakByName.get(normalizeName(emp.employee)) ?? 0;
												if (!streak) return null;
												return (
													<span className="streak-pill streak-pill-compact">
														<Flame className="w-3.5 h-3.5" />
														<span>{streak}</span>
													</span>
												);
											})()}
										</div>
									</td>
									<td>{((emp.percent ?? 0) * 100).toFixed(2)}%</td>
									<td>{formatMoney(Number(emp.cutSales ?? emp.sales ?? 0))}</td>
									<td>{formatMoney(Number(emp.cutBonus ?? emp.bonus ?? 0))}</td>
									<td>{formatMoney(Number(emp.basePay ?? 0))}</td>
									<td>{formatMoney(Number(emp.totalPay ?? 0))}</td>
								</tr>
							))}
							{sortedEmployees.length > 0 && visibleEmployees.length === 0 && (
								<tr>
									<td colSpan={6}>No users match your search.</td>
								</tr>
							)}
							{sortedEmployees.length === 0 && (
								<tr>
									<td colSpan={6}>No payroll data loaded.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<aside className="detail">
					<h2>{selectedEmployee?.employee || "Select employee"}</h2>
					<div className="detail-fields">
						<div>
							<label>Percent</label>
							<input
								type="number"
								min={0}
								step={0.1}
								value={detailPercent}
								onChange={(e) => setDetailPercent(e.target.value)}
							/>
						</div>
						<button type="button" className="btn accent" onClick={handleApply}>
							Apply
						</button>
					</div>
					{selectedEmployeeDaily.length > 0 ? (
						<div className="chart-card">
							<h3 className="text-slate-200 text-sm mb-3">Daily earnings ({selectedCutLabel})</h3>
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-slate-400">
										<th className="pb-2">Date</th>
										<th className="pb-2 text-right">Sales</th>
										<th className="pb-2 text-right">Bonus</th>
										<th className="pb-2 text-right">Earned</th>
									</tr>
								</thead>
								<tbody className="text-slate-200">
									{selectedEmployeeDaily.map((row) => (
										<tr key={row.dateKey} className="border-t border-slate-700/60">
											<td className="py-2">{row.dateKey}</td>
											<td className="py-2 text-right">{formatMoney(row.sales)}</td>
											<td className="py-2 text-right">{formatMoney(row.bonus)}</td>
											<td className="py-2 text-right text-emerald-300">{formatMoney(row.earned)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div className="text-sm text-slate-400">No daily data for this cut.</div>
					)}
					{selectedEmployee && normalizeName(selectedEmployee.employee) === "bulze" && (
						<div className="chart-card">
							<h3 className="text-slate-200 text-sm mb-3">Bulze 1% share ({selectedCutLabel})</h3>
							<div className="flex items-center justify-between text-sm mb-3">
								<span className="text-slate-400">Total share paid in this cut</span>
								<span className="text-emerald-300 font-semibold tabular-nums">
									{formatMoney(bulzeCutShareTotal)}
								</span>
							</div>
							{bulzeCutShareDetails.length > 0 ? (
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left text-slate-400">
											<th className="pb-2">Chatter</th>
											<th className="pb-2">Inflow</th>
											<th className="pb-2 text-right">Prev month sales</th>
											<th className="pb-2 text-right">Bulze 1%</th>
										</tr>
									</thead>
									<tbody className="text-slate-200">
										{bulzeCutShareDetails.map((entry) => (
											<tr key={entry.user.id} className="border-t border-slate-700/60">
												<td className="py-2">{entry.user.name || entry.user.email}</td>
												<td className="py-2 text-slate-400">{entry.user.inflow_username || "-"}</td>
												<td className="py-2 text-right">{formatMoney(entry.monthlySales)}</td>
												<td className="py-2 text-right text-emerald-300">{formatMoney(entry.share)}</td>
											</tr>
										))}
									</tbody>
								</table>
							) : (
								<p className="text-sm text-slate-500">No assigned chatter sales for the previous month.</p>
							)}
						</div>
					)}
					{updatedAt && (
						<p className="text-xs text-slate-500">
							Last updated: {new Date(updatedAt).toLocaleString()} {aiStatus ? `(${aiStatus})` : ""}
						</p>
					)}
				</aside>
			</section>

			<section className={cn("panel tab-panel", activeTab === "ppv" && "active")}>
				<div className="ppv-panel">
					<h3>PPV of the day</h3>
					<div className="ppv-columns">
						<div>
							<h4>Ass PPV</h4>
							<ul>{renderPpvList(ppvDay.ass)}</ul>
						</div>
						<div>
							<h4>Tits PPV</h4>
							<ul>{renderPpvList(ppvDay.tits)}</ul>
						</div>
						<div>
							<h4>Best overall baits</h4>
							<ul>{renderPpvList(ppvDay.overall)}</ul>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

function TrainingRolesPanel() {
	const usersOrm = UsersORM.getInstance();
	const queryClient = useQueryClient();
	const [edits, setEdits] = useState<Record<string, Partial<UsersModel>>>({});
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [metaDrafts, setMetaDrafts] = useState<Record<string, ChatterAdminMeta>>({});
	const [metaUpdatedAt, setMetaUpdatedAt] = useState<Record<string, string | null>>({});
	const [bonusDrafts, setBonusDrafts] = useState<Record<string, { type: "shift" | "double_shift" | "holiday"; amount: number; date: string }>>({});

	const { data: users = [] } = useQuery({
		queryKey: ["allUsers"],
		queryFn: () => usersOrm.getAllUsers(),
	});

	const trainingUsers = users
		.filter((user) => !user.is_admin)
		.slice()
		.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

	const trainingUserIds = useMemo(() => trainingUsers.map((u) => u.id).sort().join("|"), [trainingUsers]);
	const { data: bulzeShareMetaList = [] } = useQuery({
		queryKey: ["trainingBulzeShareMeta", trainingUserIds],
		enabled: trainingUsers.length > 0,
		queryFn: async () => {
			const results = await Promise.all(
				trainingUsers.map(async (u) => {
					try {
						const response = await fetchChatterAdminMeta(u.id);
						return { userId: u.id, meta: response.meta };
					} catch {
						return { userId: u.id, meta: null as ChatterAdminMeta | null };
					}
				}),
			);
			return results;
		},
	});

	const bulzeShareByUserId = useMemo(() => {
		const map = new Map<string, boolean>();
		for (const entry of bulzeShareMetaList) {
			if (!entry.userId) continue;
			map.set(entry.userId, Boolean(entry.meta?.bulze_share));
		}
		for (const [userId, meta] of Object.entries(metaDrafts)) {
			if (!meta) continue;
			map.set(userId, Boolean(meta.bulze_share));
		}
		return map;
	}, [bulzeShareMetaList, metaDrafts]);

	const saveUserAndMeta = useMutation({
		mutationFn: async (payload: { user: UsersModel; userPatch: Partial<UsersModel>; meta: ChatterAdminMeta }) => {
			await usersOrm.setUsersById(payload.user.id, { ...payload.user, ...payload.userPatch });
			const updatedIso = await saveChatterAdminMeta(payload.user.id, payload.meta);
			return { updatedIso };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["allUsers"] });
		},
	});

	const saveMetaOnly = useMutation({
		mutationFn: async (payload: { userId: string; meta: ChatterAdminMeta }) => {
			const updatedIso = await saveChatterAdminMeta(payload.userId, payload.meta);
			return { updatedIso };
		},
	});

	const updateEdit = (userId: string, patch: Partial<UsersModel>) => {
		setEdits((prev) => ({
			...prev,
			[userId]: { ...prev[userId], ...patch },
		}));
	};

	useEffect(() => {
		if (selectedUserId) return;
		if (trainingUsers.length === 0) return;
		setSelectedUserId(trainingUsers[0].id);
	}, [selectedUserId, trainingUsers]);

	const selectedUser = selectedUserId ? trainingUsers.find((u) => u.id === selectedUserId) ?? null : null;

	const { data: selectedMetaResponse } = useQuery({
		queryKey: ["chatterAdminMeta", selectedUserId],
		enabled: Boolean(selectedUserId),
		queryFn: () => fetchChatterAdminMeta(selectedUserId as string),
	});

	useEffect(() => {
		if (!selectedUserId) return;
		if (metaDrafts[selectedUserId]) return;
		const meta = selectedMetaResponse?.meta;
		setMetaDrafts((prev) => ({
			...prev,
			[selectedUserId]: meta ?? buildDefaultChatterMeta(),
		}));
		setMetaUpdatedAt((prev) => ({
			...prev,
			[selectedUserId]: selectedMetaResponse?.updatedAt ?? null,
		}));
	}, [selectedUserId, selectedMetaResponse, metaDrafts]);

	const updateMeta = (userId: string, patch: Partial<ChatterAdminMeta>) => {
		setMetaDrafts((prev) => ({
			...prev,
			[userId]: { ...(prev[userId] ?? {}), ...patch },
		}));
	};

	const getBonusLabel = (type: "shift" | "double_shift" | "holiday") => {
		if (type === "double_shift") return "Double shift bonus";
		if (type === "holiday") return "Holiday bonus";
		return "Shift bonus";
	};

	const getBonusDraft = (userId: string) =>
		bonusDrafts[userId] ?? {
			type: "shift" as const,
			amount: 0,
			date: format(new Date(), "yyyy-MM-dd"),
		};

	const updateBonusDraft = (
		userId: string,
		patch: Partial<{ type: "shift" | "double_shift" | "holiday"; amount: number; date: string }>,
	) => {
		setBonusDrafts((prev) => ({
			...prev,
			[userId]: { ...getBonusDraft(userId), ...patch },
		}));
	};

	const addBonusEntry = (userId: string) => {
		const draft = getBonusDraft(userId);
		if (!draft.date || !Number.isFinite(draft.amount) || draft.amount <= 0) return;
		const entry = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			type: draft.type,
			amount: Number(draft.amount),
			date: draft.date,
		};
		const existing = metaDrafts[userId]?.bonus_entries ?? [];
		updateMeta(userId, { bonus_entries: [...existing, entry] });
		updateBonusDraft(userId, { amount: 0 });
	};

	const removeBonusEntry = (userId: string, entryId: string) => {
		const existing = metaDrafts[userId]?.bonus_entries ?? [];
		updateMeta(userId, { bonus_entries: existing.filter((entry) => entry.id !== entryId) });
	};

	const filteredUsers = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return trainingUsers;
		return trainingUsers.filter((u) => {
			const name = (u.name || "").toLowerCase();
			const email = (u.email || "").toLowerCase();
			const inflow = (u.inflow_username || "").toLowerCase();
			return name.includes(q) || email.includes(q) || inflow.includes(q);
		});
	}, [trainingUsers, search]);

	const groupedUsers = useMemo(() => {
		const pending: UsersModel[] = [];
		const approvedRecruits: UsersModel[] = [];
		const approvedChatters: UsersModel[] = [];

		for (const user of filteredUsers) {
			const role = user.role || DEFAULT_ROLE;
			if (!user.is_approved) {
				pending.push(user);
			} else if (role === "chatter") {
				approvedChatters.push(user);
			} else {
				approvedRecruits.push(user);
			}
		}

		return { pending, approvedRecruits, approvedChatters };
	}, [filteredUsers]);

	return (
		<Card className="chatter-panel">
			<CardHeader>
				<CardTitle className="text-slate-100">Roles & Inflow Mapping</CardTitle>
				<CardDescription className="text-slate-400">
					Assign roles, inflow usernames, and admin adjustments (bonuses/penalties + reviews)
				</CardDescription>
			</CardHeader>
			<CardContent className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
				<div className="space-y-3">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search user..."
					/>
					<div className="border border-slate-700 rounded-lg chatter-panel divide-y divide-slate-700 overflow-hidden">
						{groupedUsers.pending.length > 0 && (
							<div className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
								Pending approval ({groupedUsers.pending.length})
							</div>
						)}
						{groupedUsers.pending.map((user) => {
							const active = user.id === selectedUserId;
							const isBulzeShare = bulzeShareByUserId.get(user.id);
							return (
								<button
									key={user.id}
									type="button"
									onClick={() => setSelectedUserId(user.id)}
									className={cn(
										"w-full text-left px-4 py-3 hover:bg-slate-800/60 transition flex items-start justify-between gap-3",
										active && "bg-slate-800/70",
									)}
								>
									<div className="min-w-0">
										<p className="text-slate-100 font-medium truncate">{user.name}</p>
										<p className="text-xs text-slate-400 truncate">{user.inflow_username || user.email}</p>
									</div>
									<div className="flex items-center gap-2">
										{isBulzeShare && (
											<Badge variant="outline" className="border-emerald-400/60 text-emerald-300">
												B
											</Badge>
										)}
										<Badge variant="outline" className="border-slate-700 text-slate-200">
											Pending
										</Badge>
									</div>
								</button>
							);
						})}
						{groupedUsers.approvedChatters.length > 0 && (
							<div className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
								Approved chatters ({groupedUsers.approvedChatters.length})
							</div>
						)}
						{groupedUsers.approvedChatters.map((user) => {
							const active = user.id === selectedUserId;
							const isBulzeShare = bulzeShareByUserId.get(user.id);
							return (
								<button
									key={user.id}
									type="button"
									onClick={() => setSelectedUserId(user.id)}
									className={cn(
										"w-full text-left px-4 py-3 hover:bg-slate-800/60 transition flex items-start justify-between gap-3",
										active && "bg-slate-800/70",
									)}
								>
									<div className="min-w-0">
										<p className="text-slate-100 font-medium truncate">{user.name}</p>
										<p className="text-xs text-slate-400 truncate">{user.inflow_username || user.email}</p>
									</div>
									<div className="flex items-center gap-2">
										{isBulzeShare && (
											<Badge variant="outline" className="border-emerald-400/60 text-emerald-300">
												B
											</Badge>
										)}
										<Badge variant="outline" className="border-slate-700 text-slate-200">
											{user.role || DEFAULT_ROLE}
										</Badge>
									</div>
								</button>
							);
						})}
						{groupedUsers.approvedRecruits.length > 0 && (
							<div className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
								Approved recruits ({groupedUsers.approvedRecruits.length})
							</div>
						)}
						{groupedUsers.approvedRecruits.map((user) => {
							const active = user.id === selectedUserId;
							const isBulzeShare = bulzeShareByUserId.get(user.id);
							return (
								<button
									key={user.id}
									type="button"
									onClick={() => setSelectedUserId(user.id)}
									className={cn(
										"w-full text-left px-4 py-3 hover:bg-slate-800/60 transition flex items-start justify-between gap-3",
										active && "bg-slate-800/70",
									)}
								>
									<div className="min-w-0">
										<p className="text-slate-100 font-medium truncate">{user.name}</p>
										<p className="text-xs text-slate-400 truncate">{user.inflow_username || user.email}</p>
									</div>
									<div className="flex items-center gap-2">
										{isBulzeShare && (
											<Badge variant="outline" className="border-emerald-400/60 text-emerald-300">
												B
											</Badge>
										)}
										<Badge variant="outline" className="border-slate-700 text-slate-200">
											{user.role || DEFAULT_ROLE}
										</Badge>
									</div>
								</button>
							);
						})}
						{trainingUsers.length === 0 && (
							<div className="px-4 py-6 text-center text-slate-500">No users available</div>
						)}
						{trainingUsers.length > 0 && filteredUsers.length === 0 && (
							<div className="px-4 py-6 text-center text-slate-500">No users match your search.</div>
						)}
					</div>
				</div>

				<div className="min-w-0">
					{!selectedUser && (
						<div className="text-slate-400 text-sm">Select a user to edit their settings.</div>
					)}

					{selectedUser && (() => {
						const draft = edits[selectedUser.id] || {};
						const role = (draft.role ?? selectedUser.role ?? DEFAULT_ROLE) as string;
						const inflow = (draft.inflow_username ?? selectedUser.inflow_username ?? "") as string;
						const meta = metaDrafts[selectedUser.id] ?? buildDefaultChatterMeta();
						const metaUpdated = metaUpdatedAt[selectedUser.id] ?? null;
						const bonusDraft = getBonusDraft(selectedUser.id);

						return (
							<Card className="chatter-panel">
								<CardHeader className="pb-4">
									<CardTitle className="text-slate-100 flex items-center justify-between gap-4">
										<span className="truncate">{selectedUser.name}</span>
										{metaUpdated && (
											<span className="text-xs font-normal text-slate-500">
												Updated {format(parseISO(metaUpdated), "MMM d, HH:mm")}
											</span>
										)}
									</CardTitle>
									<CardDescription className="text-slate-400">{selectedUser.email}</CardDescription>
								</CardHeader>
								<CardContent className="space-y-6">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Role</Label>
											<select
												className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
												value={role}
												onChange={(e) => updateEdit(selectedUser.id, { role: e.target.value })}
											>
												<option value="recruit">Recruit</option>
												<option value="chatter">Chatter</option>
											</select>
										</div>
										<div className="space-y-2">
											<Label>Inflow Username</Label>
											<Input
												value={inflow}
												onChange={(e) => updateEdit(selectedUser.id, { inflow_username: e.target.value })}
												placeholder="inflow username"
											/>
										</div>
									</div>
									<div className="space-y-2">
										<Label>Bulze share</Label>
										<div className="flex items-center gap-2">
											<input
												type="checkbox"
												className="h-4 w-4 accent-slate-200"
												checked={Boolean(meta.bulze_share)}
												onChange={(e) => {
													const nextMeta = { ...meta, bulze_share: e.target.checked };
													updateMeta(selectedUser.id, { bulze_share: e.target.checked });
													saveMetaOnly.mutate(
														{ userId: selectedUser.id, meta: nextMeta },
														{
															onSuccess: (result) => {
																setMetaUpdatedAt((prev) => ({ ...prev, [selectedUser.id]: result.updatedIso }));
															},
														},
													);
												}}
											/>
											<span className="text-sm text-slate-300">
												Add to Bulze earnings (1% of monthly sales)
											</span>
										</div>
									</div>

									<Separator className="bg-slate-800" />

									<div className="space-y-3">
										<Label>Bonus entries</Label>
										<div className="space-y-2">
											{(meta.bonus_entries ?? []).length === 0 && (
												<p className="text-sm text-slate-500">No bonuses added yet.</p>
											)}
											{(meta.bonus_entries ?? []).map((entry) => (
												<div
													key={entry.id}
													className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm"
												>
													<div className="text-slate-200">
														{getBonusLabel(entry.type)} • {entry.date} • ${Number(entry.amount).toFixed(2)}
													</div>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => removeBonusEntry(selectedUser.id, entry.id)}
													>
														Remove
													</Button>
												</div>
											))}
										</div>
										<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
											<div className="space-y-2">
												<Label>Type</Label>
												<select
													className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
													value={bonusDraft.type}
													onChange={(e) => updateBonusDraft(selectedUser.id, { type: e.target.value as "shift" | "double_shift" | "holiday" })}
												>
													<option value="shift">Shift bonus</option>
													<option value="double_shift">Double shift bonus</option>
													<option value="holiday">Holiday bonus</option>
												</select>
											</div>
											<div className="space-y-2">
												<Label>Date</Label>
												<Input
													type="date"
													value={bonusDraft.date}
													onChange={(e) => updateBonusDraft(selectedUser.id, { date: e.target.value })}
												/>
											</div>
											<div className="space-y-2">
												<Label>Amount ($)</Label>
												<Input
													type="number"
													min={0}
													step={0.01}
													value={String(bonusDraft.amount)}
													onChange={(e) => updateBonusDraft(selectedUser.id, { amount: Number(e.target.value || 0) })}
												/>
											</div>
											<div className="space-y-2 flex items-end">
												<Button type="button" className="w-full" onClick={() => addBonusEntry(selectedUser.id)}>
													Add bonus
												</Button>
											</div>
										</div>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Manual Penalty ($)</Label>
											<Input
												type="number"
												min={0}
												step={0.01}
												value={String(meta.manual_penalty ?? 0)}
												onChange={(e) => updateMeta(selectedUser.id, { manual_penalty: Number(e.target.value || 0) })}
											/>
										</div>
									</div>

									<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Admin notes (private)</Label>
											<Textarea
												value={meta.admin_notes ?? ""}
												onChange={(e) => updateMeta(selectedUser.id, { admin_notes: e.target.value })}
												placeholder="Private notes for admins..."
												className="min-h-[130px]"
											/>
										</div>
										<div className="space-y-2">
											<Label>Admin review (visible to chatter)</Label>
											<Textarea
												value={meta.admin_review ?? ""}
												onChange={(e) => updateMeta(selectedUser.id, { admin_review: e.target.value })}
												placeholder="This will appear on the chatter dashboard..."
												className="min-h-[130px]"
											/>
										</div>
									</div>

									<div className="flex justify-end">
										<Button
											onClick={() => {
												saveUserAndMeta.mutate(
													{
														user: selectedUser,
														userPatch: draft,
														meta,
													},
													{
														onSuccess: (result) => {
															setMetaUpdatedAt((prev) => ({ ...prev, [selectedUser.id]: result.updatedIso }));
														},
													},
												);
											}}
											disabled={saveUserAndMeta.isPending}
										>
											Save changes
										</Button>
									</div>
								</CardContent>
							</Card>
						);
					})()}
				</div>
			</CardContent>
		</Card>
	);
}

function DailyVideoPanel() {
	const [videoTitle, setVideoTitle] = useState("");
	const [videoDescription, setVideoDescription] = useState("");
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [videoUrl, setVideoUrl] = useState("");
	const [cardImageFile, setCardImageFile] = useState<File | null>(null);
	const [cardImageUrl, setCardImageUrl] = useState("");
	const [videoDuration, setVideoDuration] = useState(0);
	const [status, setStatus] = useState("");
	const [statsVideoId, setStatsVideoId] = useState<string>("");
	const [logLines, setLogLines] = useState<string[]>([]);
	const [localVideos, setLocalVideos] = useState<DailyVideo[]>([]);

	const queryClient = useQueryClient();
	const usersOrm = UsersORM.getInstance();
	const progressOrm = UserProgressORM.getInstance();

	const { data: dailyData } = useQuery({
		queryKey: ["dailyVideos"],
		queryFn: () => fetchDailyVideos(),
	});
	const dailyVideos = dailyData?.videos ?? [];

	const { data: allUsers = [] } = useQuery({
		queryKey: ["allUsers"],
		queryFn: () => usersOrm.getAllUsers(),
	});

	const { data: allProgress = [] } = useQuery({
		queryKey: ["dailyVideoProgress", statsVideoId],
		queryFn: () => progressOrm.getAllUserProgress(),
		enabled: Boolean(statsVideoId),
	});

	useEffect(() => {
		if (dailyVideos.length === 0 && localVideos.length > 0) return;
		setLocalVideos(dailyVideos);
	}, [dailyVideos, localVideos.length]);

	useEffect(() => {
		if (statsVideoId) return;
		const active = localVideos.find((v) => v.active);
		if (active) setStatsVideoId(active.id);
		else if (localVideos[0]) setStatsVideoId(localVideos[0].id);
	}, [localVideos, statsVideoId]);

	useEffect(() => {
		if (!videoFile) return;
		const videoElement = document.createElement("video");
		videoElement.preload = "metadata";
		videoElement.onloadedmetadata = () => {
			setVideoDuration(Math.floor(videoElement.duration));
			URL.revokeObjectURL(videoElement.src);
		};
		videoElement.onerror = () => {
			setStatus("Unable to auto-detect duration from file.");
		};
		videoElement.src = URL.createObjectURL(videoFile);
	}, [videoFile]);

	useEffect(() => {
		if (!videoUrl.trim()) return;
		const videoElement = document.createElement("video");
		videoElement.preload = "metadata";
		videoElement.onloadedmetadata = () => {
			const duration = Math.floor(videoElement.duration);
			if (Number.isFinite(duration) && duration > 0) {
				setVideoDuration(duration);
			}
		};
		videoElement.onerror = () => {
			setStatus("Unable to auto-detect duration from link. Enter it manually if needed.");
		};
		videoElement.src = videoUrl.trim();
	}, [videoUrl]);

	const readFileAsDataUrl = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(new Error("Failed to read file"));
			reader.readAsDataURL(file);
		});

	const addLog = (message: string) => {
		const stamp = new Date().toLocaleTimeString();
		setLogLines((prev) => [...prev.slice(-19), `[${stamp}] ${message}`]);
	};

	const saveVideos = useMutation({
		mutationFn: async (videos: DailyVideo[]) => saveDailyVideos(videos),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dailyVideos"] });
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			addLog(`Save failed: ${message}`);
		},
	});

	const handlePublish = async () => {
		addLog("Publish clicked.");
		if (!videoTitle.trim()) {
			setStatus("Add a title.");
			addLog("Missing title.");
			return;
		}
		if (!videoFile && !videoUrl.trim()) {
			setStatus("Upload a video file or add a link.");
			addLog("Missing file or link.");
			return;
		}
		if (!videoDuration) {
			setStatus("Video duration is missing.");
			addLog("Missing duration.");
			return;
		}
		if (videoFile && videoFile.size > 70 * 1024 * 1024) {
			setStatus("Video is too large for in-app storage (70MB limit).");
			addLog("File too large.");
			return;
		}
		if (cardImageFile && cardImageFile.size > 5 * 1024 * 1024) {
			setStatus("Card image is too large (5MB limit).");
			addLog("Card image too large.");
			return;
		}

		setStatus("Uploading...");
		addLog("Uploading...");
		try {
			const url = videoFile ? await readFileAsDataUrl(videoFile) : videoUrl.trim();
			const thumbnailUrl = cardImageFile
				? await readFileAsDataUrl(cardImageFile)
				: (cardImageUrl.trim() || "/thub1.png");
			const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const nextVideo: DailyVideo = {
				id,
				title: videoTitle.trim(),
				description: videoDescription.trim(),
				url,
				duration: videoDuration,
				created_at: new Date().toISOString(),
				active: true,
				thumbnail_url: thumbnailUrl,
			};
			const nextVideos = localVideos.map((v) => ({ ...v, active: false })).concat(nextVideo);
			await saveVideos.mutateAsync(nextVideos);
			setLocalVideos(nextVideos);
			addLog(`Local list updated (${nextVideos.length} videos).`);
			try {
				const persisted = await queryClient.fetchQuery({ queryKey: ["dailyVideos"], queryFn: fetchDailyVideos });
				const count = persisted.videos?.length ?? 0;
				addLog(`Backend list size: ${count}.`);
				if (count === 0) {
					setStatus("Saved locally but not returned from backend yet.");
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to fetch daily videos.";
				addLog(`Fetch after save failed: ${message}`);
			}
			setVideoTitle("");
			setVideoDescription("");
			setVideoFile(null);
			setVideoUrl("");
			setCardImageFile(null);
			setCardImageUrl("");
			setVideoDuration(0);
			setStatus("Daily video published.");
			addLog(`Published: ${nextVideo.title}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to upload.";
			setStatus(message);
			addLog(`Publish failed: ${message}`);
		}
	};

	const setActiveVideo = async (id: string) => {
		const nextVideos = localVideos.map((v) => ({ ...v, active: v.id === id }));
		await saveVideos.mutateAsync(nextVideos);
		setLocalVideos(nextVideos);
		setStatsVideoId(id);
	};

	const deleteVideo = async (id: string) => {
		const nextVideos = localVideos.filter((v) => v.id !== id);
		await saveVideos.mutateAsync(nextVideos);
		setLocalVideos(nextVideos);
		if (statsVideoId === id) {
			const next = nextVideos.find((v) => v.active) || nextVideos[0];
			setStatsVideoId(next ? next.id : "");
		}
	};

	const progressByUser = useMemo(() => {
		if (!statsVideoId) return new Map<string, UserProgressModel>();
		const map = new Map<string, UserProgressModel>();
		for (const entry of allProgress) {
			if (entry.video_id !== statsVideoId) continue;
			map.set(entry.user_id, entry);
		}
		return map;
	}, [allProgress, statsVideoId]);

	const chatters = useMemo(
		() => allUsers.filter((u) => !u.is_admin && (u.role || DEFAULT_ROLE) === "chatter"),
		[allUsers],
	);

	return (
		<Card className="chatter-panel">
			<CardHeader>
				<CardTitle className="text-slate-100">Daily Video</CardTitle>
				<CardDescription className="text-slate-400">
					Upload a daily video that appears on the chatter dashboard.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="dailyTitle">Title</Label>
							<Input
								id="dailyTitle"
								value={videoTitle}
								onChange={(e) => setVideoTitle(e.target.value)}
								placeholder="Daily focus video title"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dailyFile">Upload video file</Label>
							<input
								id="dailyFile"
								type="file"
								accept="video/*"
								onChange={(e) => {
									setVideoFile(e.target.files?.[0] || null);
									if (e.target.files?.[0]) setVideoUrl("");
								}}
							/>
							{videoFile && (
								<p className="text-xs text-slate-400">
									Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
								</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="dailyUrl">Or paste a video link (YouTube/Vimeo/MP4)</Label>
							<Input
								id="dailyUrl"
								value={videoUrl}
								onChange={(e) => {
									setVideoUrl(e.target.value);
									if (e.target.value.trim()) setVideoFile(null);
								}}
								placeholder="https://..."
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dailyDescription">Description</Label>
							<Textarea
								id="dailyDescription"
								value={videoDescription}
								onChange={(e) => setVideoDescription(e.target.value)}
								placeholder="Short summary for chatters"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dailyCardFile">Card image (optional)</Label>
							<input
								id="dailyCardFile"
								type="file"
								accept="image/*"
								onChange={(e) => {
									setCardImageFile(e.target.files?.[0] || null);
									if (e.target.files?.[0]) setCardImageUrl("");
								}}
							/>
							{cardImageFile && (
								<p className="text-xs text-slate-400">
									Selected: {cardImageFile.name} ({(cardImageFile.size / 1024 / 1024).toFixed(2)} MB)
								</p>
							)}
							<Input
								value={cardImageUrl}
								onChange={(e) => {
									setCardImageUrl(e.target.value);
									if (e.target.value.trim()) setCardImageFile(null);
								}}
								placeholder="Or paste card image URL"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dailyDuration">Duration (seconds)</Label>
							<Input
								id="dailyDuration"
								type="number"
								value={videoDuration}
								min={0}
								onChange={(e) => setVideoDuration(Number(e.target.value || 0))}
							/>
						</div>
						<div className="flex items-center gap-3">
							<Button onClick={handlePublish} disabled={saveVideos.isPending}>
								Publish daily video
							</Button>
							{status && <span className="text-xs text-slate-400">{status}</span>}
						</div>
					</div>
					<div className="space-y-3">
						<p className="text-sm text-slate-400">
							Active daily videos ({localVideos.length})
						</p>
						{localVideos.length === 0 && (
							<p className="text-sm text-slate-500">No daily videos yet.</p>
						)}
						{localVideos.map((video) => (
							<div key={video.id} className="flex flex-col gap-2 p-3 border border-slate-700 rounded-lg chatter-panel">
								<div className="flex items-center justify-between gap-2">
									<div>
										<p className="text-slate-100 font-medium">{video.title}</p>
										<p className="text-xs text-slate-400">
											{video.description || "No description"} • {Math.floor(video.duration)}s
										</p>
									</div>
									<div className="flex items-center gap-2">
										{video.url.startsWith("data:") ? (
											<a
												href={video.url}
												download={`${video.title || "daily-video"}.mp4`}
												className="text-xs text-slate-300 underline underline-offset-2"
											>
												Download
											</a>
										) : (
											<a
												href={video.url}
												target="_blank"
												rel="noreferrer"
												className="text-xs text-slate-300 underline underline-offset-2"
											>
												Open
											</a>
										)}
										{video.active && (
											<Badge variant="outline" className="border-emerald-400/60 text-emerald-300">
												Active
											</Badge>
										)}
										<Button
											variant="outline"
											size="sm"
											onClick={() => setActiveVideo(video.id)}
											disabled={video.active}
										>
											Set active
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => deleteVideo(video.id)}
										>
											Delete
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
				<div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
					<div className="flex items-center justify-between mb-2">
						<span>Daily video log</span>
						<Button variant="ghost" size="sm" onClick={() => setLogLines([])} className="h-6 px-2 text-xs">
							Clear
						</Button>
					</div>
					{logLines.length === 0 && <div className="text-slate-500">No activity yet.</div>}
					{logLines.length > 0 && (
						<pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
							{logLines.join("\n")}
						</pre>
					)}
				</div>

				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm text-slate-300">Daily video progress</p>
							<p className="text-xs text-slate-500">Select a video to see who completed it.</p>
						</div>
						<select
							className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
							value={statsVideoId}
							onChange={(e) => setStatsVideoId(e.target.value)}
						>
							{localVideos.map((video) => (
								<option key={video.id} value={video.id}>
									{video.title}
								</option>
							))}
						</select>
					</div>
					{!statsVideoId && (
						<p className="text-sm text-slate-500">No daily videos to track yet.</p>
					)}
					{statsVideoId && (
						<div className="rounded-lg border border-slate-700 overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-slate-900/60 text-slate-400">
									<tr>
										<th className="text-left px-4 py-2">Chatter</th>
										<th className="text-left px-4 py-2">Inflow</th>
										<th className="text-left px-4 py-2">Status</th>
										<th className="text-left px-4 py-2">Completed at</th>
									</tr>
								</thead>
								<tbody className="text-slate-200">
									{chatters.map((user) => {
										const progress = progressByUser.get(user.id);
										const completed = Boolean(progress?.is_completed);
										return (
											<tr key={user.id} className="border-t border-slate-800">
												<td className="px-4 py-2">{user.name || user.email}</td>
												<td className="px-4 py-2 text-slate-400">{user.inflow_username || "-"}</td>
												<td className="px-4 py-2">
													{completed ? (
														<Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/50">
															Completed
														</Badge>
													) : (
														<Badge variant="outline" className="border-slate-700 text-slate-400">
															Not yet
														</Badge>
													)}
												</td>
												<td className="px-4 py-2 text-slate-400">
													{completed ? new Date(progress?.completed_at || "").toLocaleString() : "-"}
												</td>
											</tr>
										);
									})}
									{chatters.length === 0 && (
										<tr>
											<td colSpan={4} className="px-4 py-6 text-center text-slate-500">
												No chatters found.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function AllSubmissionsPanel() {
	const completionsOrm = CompletionsORM.getInstance();
	const quizAttemptsOrm = QuizAttemptsORM.getInstance();
	const usersOrm = UsersORM.getInstance();
	const videosOrm = VideosORM.getInstance();
	const sessionsOrm = TrainingSessionsORM.getInstance();
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const { data: allCompletions = [] } = useQuery({
		queryKey: ["allCompletions"],
		queryFn: () => completionsOrm.getAllCompletions(),
	});

	const { data: allAttempts = [] } = useQuery({
		queryKey: ["allQuizAttempts"],
		queryFn: () => quizAttemptsOrm.getAllQuizAttempts(),
	});

	const { data: allUsers = [] } = useQuery({
		queryKey: ["allUsers"],
		queryFn: () => usersOrm.getAllUsers(),
	});

	const { data: allVideos = [] } = useQuery({
		queryKey: ["videos"],
		queryFn: () => videosOrm.getAllVideos(),
	});

	const { data: allSessions = [] } = useQuery({
		queryKey: ["sessions"],
		queryFn: () => sessionsOrm.getAllTrainingSessions(),
	});

	const toEpochSeconds = (value?: string) => {
		if (!value) return 0;
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
	};

	const completionsByKey = new Map<string, CompletionsModel[]>();
	for (const completion of allCompletions) {
		const key = `${completion.user_id}::${completion.video_id}`;
		const existing = completionsByKey.get(key) || [];
		existing.push(completion);
		completionsByKey.set(key, existing);
	}

	const attemptsByKey = new Map<string, QuizAttemptsModel[]>();
	for (const attempt of allAttempts) {
		const key = `${attempt.user_id}::${attempt.video_id}`;
		const existing = attemptsByKey.get(key) || [];
		existing.push(attempt);
		attemptsByKey.set(key, existing);
	}

	const attemptOnlySubmissions = Array.from(attemptsByKey.entries())
		.filter(([key]) => !completionsByKey.has(key))
		.map(([key, attempts]) => {
			const [user_id, video_id] = key.split("::");
			const attemptsByQuestion = new Map<string, QuizAttemptsModel>();
			for (const attempt of attempts) {
				const existing = attemptsByQuestion.get(attempt.question_id);
				if (!existing || toEpochSeconds(attempt.attempted_at) >= toEpochSeconds(existing.attempted_at)) {
					attemptsByQuestion.set(attempt.question_id, attempt);
				}
			}
			const latestAttempts = Array.from(attemptsByQuestion.values());
			const latestAttempt = latestAttempts.reduce<QuizAttemptsModel | null>((latest, current) => {
				if (!latest) return current;
				return toEpochSeconds(current.attempted_at) > toEpochSeconds(latest.attempted_at) ? current : latest;
			}, null);
			return {
				user_id,
				video_id,
				latestAttempts,
				allAttempts: attempts,
				latestAttempt,
			};
		});

	const submissions = [
		...allCompletions.map((completion) => ({
			type: "completion" as const,
			completion,
			timestamp: toEpochSeconds(completion.completed_at),
		})),
		...attemptOnlySubmissions.map((submission) => ({
			type: "attempt" as const,
			submission,
			timestamp: submission.latestAttempt ? toEpochSeconds(submission.latestAttempt.attempted_at) : 0,
		})),
	].sort((a, b) => b.timestamp - a.timestamp);

	return (
		<Card className="chatter-panel">
			<CardHeader>
				<CardTitle className="text-slate-100">All User Submissions ({submissions.length})</CardTitle>
				<CardDescription className="text-slate-400">View all quiz completions and answers from all users</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-6">
					{submissions.map((entry) => {
						if (entry.type === "completion") {
							const completion = entry.completion;
							const user = allUsers.find((u) => u.id === completion.user_id);
							const video = allVideos.find((v) => v.id === completion.video_id);
							const session = allSessions.find((s) => s.video_id === completion.video_id);
							const userAttempts = allAttempts.filter(
								(a) => a.user_id === completion.user_id && a.video_id === completion.video_id
							);

							const passed = session ? completion.score >= session.pass_threshold : false;
							const entryKey = `completion::${completion.id}`;
							const isOpen = expandedKey === entryKey;

							return (
								<Card key={completion.id} className="bg-slate-800 border-slate-700">
									<CardHeader>
										<button
											type="button"
											onClick={() => setExpandedKey(isOpen ? null : entryKey)}
											className="w-full text-left"
										>
											<div className="flex items-start justify-between gap-4">
												<div className="min-w-0">
													<CardTitle className="text-lg">{user?.name || "Unknown User"}</CardTitle>
													<CardDescription className="truncate">
														{video?.title || "Unknown Video"}
													</CardDescription>
													<div className="text-sm text-slate-300 mt-1">
														Score: {completion.score}/{session?.total_questions || "?"}
													</div>
												</div>
												<div className="flex items-center gap-3">
													<Badge variant={passed ? "default" : "destructive"}>
														{passed ? "Passed" : "Failed"}
													</Badge>
													<span className="text-xs text-slate-400">
														{isOpen ? "Hide details" : "View details"}
													</span>
												</div>
											</div>
										</button>
									</CardHeader>
									{isOpen && (
										<CardContent>
										<div className="space-y-4">
											<div className="text-sm text-slate-300">
												<p>
													<strong>Submitted:</strong> {new Date(toEpochSeconds(completion.completed_at) * 1000).toLocaleString()}
												</p>
												<p>
													<strong>Completion Code:</strong> {completion.completion_code}
												</p>
												<p>
													<strong>Total Question Attempts:</strong> {userAttempts.length}
												</p>
											</div>

											<Separator />

											<div className="space-y-3">
												<Label className="text-base">Individual Answers:</Label>
												{userAttempts.length > 0 ? (
													userAttempts.map((attempt, idx) => (
														<div key={attempt.id} className="p-3 chatter-panel rounded-lg">
															<div className="flex justify-between items-start mb-2">
																<p className="text-sm font-medium text-slate-200">Answer {idx + 1}</p>
																<Badge variant={attempt.is_correct ? "default" : "secondary"}>
																	{attempt.is_correct ? "Correct" : "Incorrect"}
																</Badge>
															</div>
															<p className="text-sm text-slate-300 mb-1">
																<strong>Answer:</strong> {attempt.user_answer}
															</p>
															{attempt.ai_feedback && (
																<p className="text-xs text-slate-400 italic">
																	<strong>AI Feedback:</strong> {attempt.ai_feedback}
																</p>
															)}
														</div>
													))
												) : (
													<p className="text-sm text-slate-400">No individual answers recorded</p>
												)}
											</div>
										</div>
									</CardContent>
									)}
								</Card>
							);
						}

						const { submission } = entry;
						const user = allUsers.find((u) => u.id === submission.user_id);
						const video = allVideos.find((v) => v.id === submission.video_id);
						const session = allSessions.find((s) => s.video_id === submission.video_id);
						const score = submission.latestAttempts.filter((attempt) => attempt.is_correct).length;
						const totalQuestions = session?.total_questions || submission.latestAttempts.length;
						const submittedAt = submission.latestAttempt
							? new Date(toEpochSeconds(submission.latestAttempt.attempted_at) * 1000).toLocaleString()
							: "Unknown";
						const entryKey = `attempt::${submission.user_id}::${submission.video_id}`;
						const isOpen = expandedKey === entryKey;

						return (
							<Card key={`${submission.user_id}::${submission.video_id}`} className="chatter-panel">
								<CardHeader>
									<button
										type="button"
										onClick={() => setExpandedKey(isOpen ? null : entryKey)}
										className="w-full text-left"
									>
										<div className="flex items-start justify-between gap-4">
											<div className="min-w-0">
												<CardTitle className="text-lg">{user?.name || "Unknown User"}</CardTitle>
												<CardDescription className="truncate">
													{video?.title || "Unknown Video"}
												</CardDescription>
												<div className="text-sm text-slate-300 mt-1">
													Score: {score}/{totalQuestions}
												</div>
											</div>
											<div className="flex items-center gap-3">
												<Badge variant="secondary">Incomplete</Badge>
												<span className="text-xs text-slate-400">
													{isOpen ? "Hide details" : "View details"}
												</span>
											</div>
										</div>
									</button>
								</CardHeader>
								{isOpen && (
									<CardContent>
										<div className="space-y-4">
											<div className="text-sm text-slate-300">
												<p>
													<strong>Latest Attempt:</strong> {submittedAt}
												</p>
												<p>
													<strong>Total Question Attempts:</strong> {submission.allAttempts.length}
												</p>
											</div>

											<Separator />

											<div className="space-y-3">
												<Label className="text-base">Latest Answers:</Label>
												{submission.latestAttempts.length > 0 ? (
													submission.latestAttempts.map((attempt, idx) => (
														<div key={attempt.id} className="p-3 chatter-panel rounded-lg">
															<div className="flex justify-between items-start mb-2">
																<p className="text-sm font-medium text-slate-200">Answer {idx + 1}</p>
																<Badge variant={attempt.is_correct ? "default" : "secondary"}>
																	{attempt.is_correct ? "Correct" : "Incorrect"}
																</Badge>
															</div>
															<p className="text-sm text-slate-300 mb-1">
																<strong>Answer:</strong> {attempt.user_answer}
															</p>
															{attempt.ai_feedback && (
																<p className="text-xs text-slate-400 italic">
																	<strong>AI Feedback:</strong> {attempt.ai_feedback}
																</p>
															)}
														</div>
													))
												) : (
													<p className="text-sm text-slate-400">No individual answers recorded</p>
												)}
											</div>
										</div>
									</CardContent>
								)}
							</Card>
						);
					})}
					{submissions.length === 0 && <p className="text-center text-slate-500 py-8">No submissions yet</p>}
				</div>
			</CardContent>
		</Card>
	);
}

function UserView({ user }: { user: UsersModel }) {
	const userId = user.id;
	const [selectedVideo, setSelectedVideo] = useState<VideosModel | null>(null);
	const [showQuiz, setShowQuiz] = useState(false);
	const [completionResult, setCompletionResult] = useState<{
		completion: CompletionsModel;
		totalQuestions: number;
		passThreshold: number;
	} | null>(null);

	const videosOrm = VideosORM.getInstance();
	const progressOrm = UserProgressORM.getInstance();
	const completionsOrm = CompletionsORM.getInstance();

	const { data: videos = [] } = useQuery({
		queryKey: ["videos"],
		queryFn: () => videosOrm.getAllVideos(),
	});

	const { data: userProgress = [] } = useQuery({
		queryKey: ["userProgress", userId],
		queryFn: () => progressOrm.getUserProgressByUserId(userId),
	});

	const { data: userCompletions = [] } = useQuery({
		queryKey: ["userCompletions", userId],
		queryFn: () => completionsOrm.getCompletionsByUserId(userId),
	});

	const handleSelectVideo = (video: VideosModel) => {
		setSelectedVideo(video);
		setShowQuiz(false);
		setCompletionResult(null);
	};

	const handleVideoComplete = () => {
		setShowQuiz(true);
	};

	const handleQuizComplete = (result: CompletionsModel, meta: { totalQuestions: number; passThreshold: number }) => {
		setCompletionResult({ completion: result, ...meta });
	};

	if (completionResult) {
		return <CompletionScreen completion={completionResult.completion} totalQuestions={completionResult.totalQuestions} passThreshold={completionResult.passThreshold} onReset={() => {
			setSelectedVideo(null);
			setShowQuiz(false);
			setCompletionResult(null);
		}} />;
	}

	if (showQuiz && selectedVideo) {
		return (
			<QuizInterface
				videoId={selectedVideo.id}
				userId={userId}
				onComplete={handleQuizComplete}
				onBack={() => setShowQuiz(false)}
			/>
		);
	}

	if (selectedVideo) {
		return (
			<VideoPlayer
				video={selectedVideo}
				userId={userId}
				onComplete={handleVideoComplete}
				onBack={() => setSelectedVideo(null)}
			/>
		);
	}

	return (
		<div className="space-y-6">
			{user.role === "chatter" && (
				<ChatterDashboard user={user} />
			)}
			<Card className="chatter-panel chatter-neo">
				<CardHeader>
					<CardTitle className="text-slate-100">Available Training Videos</CardTitle>
					<CardDescription className="text-slate-400">Select a video to begin your training</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{videos.map((video) => {
							const progress = userProgress.find((p) => p.video_id === video.id);
							const completion = userCompletions.find((c) => c.video_id === video.id);

							return (
								<Card
									key={video.id}
									className="training-card cursor-pointer transition-shadow"
									onClick={() => handleSelectVideo(video)}
								>
									<CardHeader>
										<div className="flex justify-between items-start">
											<CardTitle className="text-lg">{video.title}</CardTitle>
											{completion && (
												<Badge className="bg-green-600">
													<Trophy className="w-3 h-3 mr-1" />
													Completed
												</Badge>
											)}
										</div>
										<CardDescription>{video.description}</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="flex justify-between items-center text-sm text-slate-600">
											<span>{Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, "0")}</span>
											{progress?.is_completed && !completion && (
												<Badge variant="outline">Video Watched</Badge>
											)}
										</div>
										{completion && (
											<div className="mt-3 pt-3 border-t">
												<div className="flex justify-between text-sm">
													<span>Score:</span>
													<span className="font-semibold text-slate-100">{completion.score}/10</span>
												</div>
												<div className="flex justify-between text-sm mt-1">
													<span>Code:</span>
													<span className="font-mono font-bold text-slate-100">{completion.completion_code}</span>
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							);
						})}
						{videos.length === 0 && (
							<div className="col-span-2 text-center py-12 text-slate-500">
								No training videos available yet
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ChatterDashboard({ user }: { user: UsersModel }) {
	const [snapshot, setSnapshot] = useState<PayrollSnapshot | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);
	const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
	const [showBulzeDetails, setShowBulzeDetails] = useState(false);
	const [dailyDialogOpen, setDailyDialogOpen] = useState(false);
	const [dailyCardFlipped, setDailyCardFlipped] = useState(false);
	const { data: chatterMetaResponse } = useQuery({
		queryKey: ["chatterAdminMeta", user.id],
		queryFn: () => fetchChatterAdminMeta(user.id),
	});
	const usersOrm = UsersORM.getInstance();
	const progressOrm = UserProgressORM.getInstance();
	const isBulzeUser = ["bulze"].includes(normalizeName(user.name)) || ["bulze"].includes(normalizeName(user.inflow_username));

	const loadSnapshot = async () => {
		const stored = await fetchPayrollSnapshot();
		setSnapshot(stored.snapshot);
		setLastUpdated(stored.updatedAt);
	};

	useEffect(() => {
		loadSnapshot().catch(() => {});
	}, []);

	const inflow = user.inflow_username?.trim();
	const employee = inflow && snapshot
		? snapshot.employees.find((emp) => emp.employee.toLowerCase() === inflow.toLowerCase())
		: null;

	const { data: allUsers = [] } = useQuery({
		queryKey: ["allUsers"],
		queryFn: () => usersOrm.getAllUsers(),
		enabled: isBulzeUser,
	});
	const allUserIds = useMemo(() => allUsers.map((u) => u.id).sort().join("|"), [allUsers]);
	const { data: bulzeShareMeta = [] } = useQuery({
		queryKey: ["bulzeShareMeta", allUserIds],
		enabled: isBulzeUser && allUsers.length > 0,
		queryFn: async () => {
			const base = allUsers.filter((u) => !u.is_admin);
			const results = await Promise.all(
				base.map(async (u) => {
					try {
						const response = await fetchChatterAdminMeta(u.id);
						return { user: u, meta: response.meta };
					} catch {
						return { user: u, meta: null };
					}
				}),
			);
			return results;
		},
	});

	const percent = Number(employee?.percent ?? 0.09);
	const chatterMeta = chatterMetaResponse?.meta ?? null;
	const bonusEntries = Array.isArray(chatterMeta?.bonus_entries) ? chatterMeta.bonus_entries : [];
	const loginStreak = Number(chatterMeta?.login_streak ?? 0);
	const sales = Number(employee?.sales ?? 0);
	const { data: dailyVideoResponse } = useQuery({
		queryKey: ["dailyVideos"],
		queryFn: () => fetchDailyVideos(),
	});
	const activeDailyVideo = useMemo(
		() => dailyVideoResponse?.videos?.find((video) => video.active) ?? null,
		[dailyVideoResponse],
	);
	const dailyCardImage = activeDailyVideo?.thumbnail_url || "/thub1.png";
	const { data: dailyProgress } = useQuery({
		queryKey: ["videoProgress", user.id, activeDailyVideo?.id],
		enabled: Boolean(activeDailyVideo),
		queryFn: async () => {
			if (!activeDailyVideo) return null;
			const progress = await progressOrm.getUserProgressByUserIdVideoId(user.id, activeDailyVideo.id);
			return progress[0] || null;
		},
	});
	const dailyCompleted = Boolean(dailyProgress?.is_completed);

	const computeShiftBonus = (value: number) => {
		if (!Number.isFinite(value) || value <= 0) return 0;
		return Math.floor(value / 500) * 15;
	};

	const getEmployeeMonthlySales = (emp: PayrollEmployee, monthStart: Date) => {
		const monthEnd = endOfMonth(monthStart);
		let total = 0;
		const shifts = emp.shifts ?? [];
		if (shifts.length) {
			for (const shift of shifts) {
				const dateKey = String(shift.date || "").slice(0, 10);
				if (!dateKey) continue;
				let date: Date | null = null;
				try {
					date = parseISO(dateKey);
				} catch {
					date = null;
				}
				if (!date || date < monthStart || date > monthEnd) continue;
				total += Number(shift.sales ?? 0);
			}
			return total;
		}
		const daily = emp.daily_sales ?? {};
		for (const [dateKeyRaw, value] of Object.entries(daily)) {
			const dateKey = String(dateKeyRaw || "").slice(0, 10);
			if (!dateKey) continue;
			let date: Date | null = null;
			try {
				date = parseISO(dateKey);
			} catch {
				date = null;
			}
			if (!date || date < monthStart || date > monthEnd) continue;
			total += Number(value ?? 0);
		}
		return total;
	};

	const dailyEarned = useMemo(() => {
		const byDate = new Map<string, { sales: number; bonus: number }>();

		const shifts = employee?.shifts || [];
		if (shifts.length) {
			for (const shift of shifts) {
				const dateKey = String(shift.date || "").slice(0, 10);
				if (!dateKey) continue;
				const shiftSales = Number(shift.sales ?? 0);
				const shiftBonus = computeShiftBonus(shiftSales);
				const prev = byDate.get(dateKey) ?? { sales: 0, bonus: 0 };
				byDate.set(dateKey, { sales: prev.sales + shiftSales, bonus: prev.bonus + shiftBonus });
			}
		} else {
			const daily = employee?.daily_sales || {};
			for (const [dateKeyRaw, value] of Object.entries(daily)) {
				const dateKey = String(dateKeyRaw || "").slice(0, 10);
				if (!dateKey) continue;
				const daySales = Number(value ?? 0);
				const dayBonus = computeShiftBonus(daySales);
				const prev = byDate.get(dateKey) ?? { sales: 0, bonus: 0 };
				byDate.set(dateKey, { sales: prev.sales + daySales, bonus: prev.bonus + dayBonus });
			}
		}

		const entries = Array.from(byDate.entries()).map(([dateKey, values]) => {
			let date: Date | null = null;
			try {
				date = parseISO(dateKey);
			} catch {
				date = null;
			}
			const earned = values.sales * percent + values.bonus;
			return { dateKey, date, earned, sales: values.sales, bonus: values.bonus };
		}).filter((x) => x.date) as Array<{ dateKey: string; date: Date; earned: number; sales: number; bonus: number }>;

		entries.sort((a, b) => a.date.getTime() - b.date.getTime());
		return entries;
	}, [employee, percent]);

	useEffect(() => {
		if (!snapshot || calendarMonth) return;
		const base = snapshot.max_date || snapshot.min_date;
		if (!base) return;
		try {
			setCalendarMonth(startOfMonth(parseISO(base)));
		} catch {
			setCalendarMonth(startOfMonth(new Date()));
		}
	}, [snapshot, calendarMonth]);

	const calendarDays = useMemo(() => {
		if (!calendarMonth) return [];
		const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
		const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
		const days: Date[] = [];
		for (let day = start; day <= end; day = addDays(day, 1)) {
			days.push(day);
		}
		return days;
	}, [calendarMonth]);

	const earnedByDay = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of dailyEarned) {
			map.set(item.dateKey, item.earned);
		}
		return map;
	}, [dailyEarned]);

	const bonusByDay = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of dailyEarned) {
			map.set(item.dateKey, item.bonus);
		}
		return map;
	}, [dailyEarned]);

	const salesByDay = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of dailyEarned) {
			map.set(item.dateKey, item.sales);
		}
		return map;
	}, [dailyEarned]);

	const monthEstimate = useMemo(() => {
		if (!calendarMonth || dailyEarned.length === 0) return null;
		const monthStart = startOfMonth(calendarMonth);
		const monthEnd = endOfMonth(calendarMonth);
		const monthEntries = dailyEarned.filter((entry) => entry.date >= monthStart && entry.date <= monthEnd);
		if (monthEntries.length === 0) return null;
		const monthTotal = monthEntries.reduce((sum, entry) => sum + entry.earned, 0);
		const lastEntryDate = monthEntries[monthEntries.length - 1].date;
		const daysElapsed = Math.max(1, Math.floor((lastEntryDate.getTime() - monthStart.getTime()) / 86400000) + 1);
		const daysInMonth = Math.floor((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
		const estimate = (monthTotal / daysElapsed) * daysInMonth;
		return {
			monthTotal,
			estimate,
			ideal: estimate * 1.8,
		};
	}, [calendarMonth, dailyEarned]);

	const getMonthSales = (monthStart: Date) => {
		const monthEnd = endOfMonth(monthStart);
		return dailyEarned.reduce((sum, entry) => {
			if (entry.date >= monthStart && entry.date <= monthEnd) {
				return sum + Number(entry.sales || 0);
			}
			return sum;
		}, 0);
	};

	const payPeriods = useMemo(() => {
		if (!dailyEarned.length) return [];
		const first = dailyEarned[0].date;
		const last = dailyEarned[dailyEarned.length - 1].date;

		// Cut runs Friday->Thursday (14 days). Friday starts, next Friday belongs to the next cut.
		const PERIOD_DAYS = 14;
		let start = first;
		while (getDay(start) !== 5) start = subDays(start, 1);

		const periods: Array<{ start: Date; endExclusive: Date; cutoff: Date; total: number; bonusTotal: number; key: string }> = [];
		while (start <= addDays(last, 1)) {
			const endExclusive = addDays(start, PERIOD_DAYS);
			const cutoff = subDays(endExclusive, 1);
			const key = `${format(start, "yyyy-MM-dd")}__${format(endExclusive, "yyyy-MM-dd")}`;
			let total = 0;
			let bonusTotal = 0;
			for (const [dateKey, amount] of earnedByDay.entries()) {
				let day: Date;
				try {
					day = parseISO(dateKey);
				} catch {
					continue;
				}
				if (day >= start && day < endExclusive) {
					total += amount;
					bonusTotal += bonusByDay.get(dateKey) ?? 0;
				}
			}
			// Performance bonus hits the cut that includes the 1st of the next month.
			const monthStart = startOfMonth(endExclusive);
			if (monthStart > start && monthStart < endExclusive) {
				const prevMonth = startOfMonth(subMonths(monthStart, 1));
				const prevMonthSales = getMonthSales(prevMonth);
				if (prevMonthSales > 10000) {
					const units = Math.floor((prevMonthSales - 1) / 10000);
					const perfBonus = units * 250;
					total += perfBonus;
					bonusTotal += perfBonus;
				}
			}
			periods.push({ start, endExclusive, cutoff, total, bonusTotal, key });
			start = endExclusive;
		}
		return periods.filter((p) => p.total > 0 || p.bonusTotal > 0);
	}, [dailyEarned, earnedByDay, bonusByDay, getMonthSales]);

	const payPeriodByCutoff = useMemo(() => {
		const map = new Map<string, { total: number; start: Date; endExclusive: Date }>();
		for (const p of payPeriods) {
			map.set(format(p.cutoff, "yyyy-MM-dd"), { total: p.total, start: p.start, endExclusive: p.endExclusive });
		}
		return map;
	}, [payPeriods]);

	const currentPeriod = useMemo(() => {
		if (!payPeriods.length) return null;
		let reference: Date | null = null;
		if (snapshot?.max_date) {
			try {
				reference = parseISO(snapshot.max_date);
			} catch {
				reference = null;
			}
		}
		if (!reference) {
			reference = dailyEarned[dailyEarned.length - 1]?.date ?? null;
		}
		if (!reference) return payPeriods[payPeriods.length - 1];
		return payPeriods.find((p) => reference >= p.start && reference < p.endExclusive) || payPeriods[payPeriods.length - 1];
	}, [payPeriods, snapshot, dailyEarned]);

	const currentCutBonusEntries = useMemo(() => {
		if (!currentPeriod) return [];
		const start = currentPeriod.start;
		const endExclusive = currentPeriod.endExclusive;
		return bonusEntries.filter((entry) => {
			if (!entry?.date) return false;
			let date: Date;
			try {
				date = parseISO(entry.date);
			} catch {
				return false;
			}
			return date >= start && date < endExclusive;
		});
	}, [bonusEntries, currentPeriod]);

	const currentCutShiftBonuses = useMemo(() => {
		if (!currentPeriod) return [];
		const start = currentPeriod.start;
		const endExclusive = currentPeriod.endExclusive;
		return dailyEarned
			.filter((entry) => entry.date >= start && entry.date < endExclusive && entry.bonus > 0)
			.map((entry) => ({ date: entry.dateKey, amount: entry.bonus }));
	}, [currentPeriod, dailyEarned]);

	const shiftBonusesTotal = useMemo(
		() => currentCutShiftBonuses.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
		[currentCutShiftBonuses],
	);

	const bonusEntriesTotal = useMemo(
		() => currentCutBonusEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
		[currentCutBonusEntries],
	);

	const bonusEntriesByType = useMemo(() => {
		const grouped: Record<"shift" | "double_shift" | "holiday", typeof currentCutBonusEntries> = {
			shift: [],
			double_shift: [],
			holiday: [],
		};
		for (const entry of currentCutBonusEntries) {
			const type = entry.type ?? "shift";
			if (type in grouped) grouped[type as "shift" | "double_shift" | "holiday"].push(entry);
		}
		return grouped;
	}, [currentCutBonusEntries]);

	const performanceBonusCurrentCut = useMemo(() => {
		if (!currentPeriod) return 0;
		const monthStartCandidate = startOfMonth(currentPeriod.endExclusive);
		if (monthStartCandidate <= currentPeriod.start || monthStartCandidate >= currentPeriod.endExclusive) {
			return 0;
		}
		const prevMonth = startOfMonth(subMonths(monthStartCandidate, 1));
		const prevMonthSales = getMonthSales(prevMonth);
		if (prevMonthSales <= 10000) return 0;
		const units = Math.floor((prevMonthSales - 1) / 10000);
		return units * 250;
	}, [currentPeriod, dailyEarned]);

	const totalCutBonuses = shiftBonusesTotal + bonusEntriesTotal + performanceBonusCurrentCut;
	const currentCutTotal = (currentPeriod?.total ?? 0) + bonusEntriesTotal + performanceBonusCurrentCut;
	const currentCutBonus = currentPeriod?.bonusTotal ?? 0;
	const previousPeriod = useMemo(() => {
		if (!currentPeriod) return null;
		const index = payPeriods.findIndex((p) => p.key === currentPeriod.key);
		if (index <= 0) return null;
		return payPeriods[index - 1];
	}, [currentPeriod, payPeriods]);

	const bulzeAssignedUsers = useMemo(() => {
		const fallbackNames = new Set(BULZE_DEFAULT_NAMES);
		return bulzeShareMeta.filter(({ user: rowUser, meta }) => {
			const explicit = meta?.bulze_share;
			if (explicit === true) return true;
			if (explicit === false) return false;
			const name = normalizeName(rowUser.name);
			const inflowName = normalizeName(rowUser.inflow_username);
			return (name && fallbackNames.has(name)) || (inflowName && fallbackNames.has(inflowName));
		});
	}, [bulzeShareMeta]);

	const payrollByName = useMemo(() => {
		const map = new Map<string, PayrollEmployee>();
		for (const emp of snapshot?.employees ?? []) {
			const key = normalizeName(emp.employee);
			if (key && !map.has(key)) map.set(key, emp);
		}
		return map;
	}, [snapshot]);

	const bulzeMonthlyEarnings = useMemo(() => {
		if (!isBulzeUser || !calendarMonth || !snapshot) return [];
		const monthStart = startOfMonth(calendarMonth);
		return bulzeAssignedUsers.map(({ user: rowUser }) => {
			const inflowName = normalizeName(rowUser.inflow_username);
			const name = normalizeName(rowUser.name);
			const employeeMatch = (inflowName && payrollByName.get(inflowName))
				|| (name && payrollByName.get(name))
				|| null;
			const totalSales = employeeMatch ? getEmployeeMonthlySales(employeeMatch, monthStart) : 0;
			return {
				user: rowUser,
				sales: totalSales,
				earned: totalSales * 0.01,
			};
		});
	}, [isBulzeUser, calendarMonth, snapshot, bulzeAssignedUsers, payrollByName]);

	const bulzeMonthlyTotal = useMemo(
		() => bulzeMonthlyEarnings.reduce((sum, entry) => sum + entry.earned, 0),
		[bulzeMonthlyEarnings],
	);

	const formatCurrency = (value: unknown, digits = 2) => {
		const amount = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(amount)) return `$${Number(0).toFixed(digits)}`;
		return `$${amount.toFixed(digits)}`;
	};

	return (
		<Card className="chatter-dashboard chatter-neo backdrop-blur">
			<CardHeader className="space-y-1">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="text-slate-100 text-xl quiz-title">Chatter Dashboard</CardTitle>
						<CardDescription className="text-slate-400">
							Your earnings overview from the latest payroll upload
						</CardDescription>
					</div>
					<div className="flex items-center gap-3">
						{loginStreak > 0 && (
							<div className="streak-pill">
								<Flame className="w-4 h-4" />
								<span>{loginStreak}d</span>
							</div>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={loadSnapshot}
							className="border-slate-700 hover:bg-slate-800"
						>
							Refresh
						</Button>
					</div>
				</div>
				{lastUpdated && (
					<p className="text-xs text-slate-500">
						Last updated: {new Date(lastUpdated).toLocaleString()}
					</p>
				)}
			</CardHeader>
			<CardContent className="space-y-6">
				{!inflow && (
					<Alert className="bg-amber-50 border-amber-200">
						<AlertDescription className="text-amber-800">
							Your inflow username is not set yet. Ask an admin to update your profile.
						</AlertDescription>
					</Alert>
				)}

				{inflow && !snapshot && (
					<Alert className="bg-blue-50 border-blue-200">
						<AlertDescription className="text-blue-800">
							No payroll data is loaded yet. Check back after the admin uploads payroll.
						</AlertDescription>
					</Alert>
				)}

				{inflow && snapshot && !employee && (
					<Alert className="bg-amber-50 border-amber-200">
						<AlertDescription className="text-amber-800">
							No payroll match found for inflow username "{inflow}". Ask an admin to verify it.
						</AlertDescription>
					</Alert>
				)}

				{activeDailyVideo && (
					<div className="daily-card-shell">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-sm font-semibold text-slate-200">Daily video</h3>
								<p className="text-xs text-slate-400">Quick focus video for today.</p>
							</div>
							{dailyCompleted && (
								<Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/50">
									Completed
								</Badge>
							)}
						</div>
						<div className="daily-card-deck">
							<div
								className={cn("daily-card", dailyCardFlipped && "daily-card-flipped")}
								onClick={() => setDailyCardFlipped((prev) => !prev)}
							>
								<div className="daily-card-inner">
									<div
										className="daily-card-face daily-card-front"
										style={{ backgroundImage: `url(${dailyCardImage})` }}
									>
										<div className="daily-card-front-title">{activeDailyVideo.title}</div>
									</div>
									<div className="daily-card-face daily-card-back">
										<p className="text-slate-200 text-sm font-semibold">Watch this</p>
										<p className="text-xs text-slate-400 line-clamp-2">
											{activeDailyVideo.description || "Daily focus video"}
										</p>
										<Dialog open={dailyDialogOpen} onOpenChange={setDailyDialogOpen}>
											<DialogTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="border-slate-700 hover:bg-slate-800 mt-2"
													onClick={(event) => event.stopPropagation()}
												>
													{dailyCompleted ? "Rewatch" : "Watch"}
												</Button>
											</DialogTrigger>
											<DialogContent className="daily-video-modal">
												<DialogHeader>
													<DialogTitle>{activeDailyVideo.title}</DialogTitle>
													{activeDailyVideo.description && (
														<DialogDescription>{activeDailyVideo.description}</DialogDescription>
													)}
												</DialogHeader>
												<VideoPlayer
													video={activeDailyVideo as VideosModel}
													userId={user.id}
													onComplete={() => {}}
													onBack={() => setDailyDialogOpen(false)}
													variant="daily"
												/>
											</DialogContent>
										</Dialog>
									</div>
								</div>
							</div>
							<div className="daily-card-meta">
								<h4 className="text-sm text-slate-200">{activeDailyVideo.title}</h4>
								<p className="text-xs text-slate-400">
									{Math.floor(activeDailyVideo.duration)}s • Tap card
								</p>
							</div>
						</div>
					</div>
				)}

				{employee && (
					<div className="space-y-6">
						{(chatterMeta?.admin_review || "").trim() && (
							<Card className="chatter-panel">
								<CardHeader className="py-4">
									<CardTitle className="text-sm text-slate-200">Admin review</CardTitle>
									<CardDescription className="text-slate-400">Feedback from management</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<p className="text-slate-200 whitespace-pre-wrap">
										{(chatterMeta?.admin_review || "").trim()}
									</p>
								</CardContent>
							</Card>
						)}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<Card className="stat-card">
								<CardHeader className="pb-2">
									<CardTitle className="text-xs uppercase tracking-wide text-slate-300">Total Sales</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-semibold text-emerald-300 tabular-nums stat-value">
										{formatCurrency(sales)}
									</div>
								</CardContent>
							</Card>
							<Card className="stat-card">
								<CardHeader className="pb-2">
									<CardTitle className="text-xs uppercase tracking-wide text-slate-300">Current Bonuses</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-semibold text-sky-300 tabular-nums stat-value">
										{formatCurrency(currentCutBonus)}
									</div>
								</CardContent>
							</Card>
							<Card className="stat-card">
								<CardHeader className="pb-2">
									<CardTitle className="text-xs uppercase tracking-wide text-slate-300">Current Cut</CardTitle>
									<CardDescription className="text-slate-400">
										{(percent * 100).toFixed(2)}% | includes shift bonuses + admin bonuses
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="text-3xl font-semibold text-amber-300 tabular-nums stat-value">
										{formatCurrency(currentCutTotal)}
									</div>
								</CardContent>
							</Card>
						</div>
						{currentPeriod && (
							<Card className="chatter-panel">
								<CardHeader className="py-4">
									<CardTitle className="text-sm text-slate-200">Cut Summary</CardTitle>
									<CardDescription className="text-slate-400">Current & previous cut totals</CardDescription>
								</CardHeader>
								<CardContent className="pt-0 space-y-3 text-sm">
									<div className="flex items-center justify-between">
										<span className="text-slate-400">
											Current ({format(currentPeriod.start, "MMM d")} - {format(subDays(currentPeriod.endExclusive, 1), "MMM d")})
										</span>
										<span className="text-amber-300 font-semibold tabular-nums">
											{formatCurrency(currentPeriod.total)}
										</span>
									</div>
									{previousPeriod ? (
										<div className="flex items-center justify-between">
											<span className="text-slate-400">
												Previous ({format(previousPeriod.start, "MMM d")} - {format(subDays(previousPeriod.endExclusive, 1), "MMM d")})
											</span>
											<span className="text-amber-300 font-semibold tabular-nums">
												{formatCurrency(previousPeriod.total)}
											</span>
										</div>
									) : (
										<div className="text-slate-500">No previous cut available.</div>
									)}
								</CardContent>
							</Card>
						)}

						<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
							<Card className="chatter-panel">
								<CardHeader>
									<CardTitle className="text-sm text-slate-200">Daily Earnings</CardTitle>
								</CardHeader>
								<CardContent>
									{dailyEarned.length ? (
										<ResponsiveContainer width="100%" height={260}>
											<LineChart
												data={dailyEarned.map((d) => ({
													date: d.dateKey,
													earned: d.earned,
													sales: d.sales,
													bonus: d.bonus,
												}))}
												margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
											>
												<CartesianGrid stroke="rgba(31,42,68,0.4)" />
												<XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
												<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
												<Tooltip
													formatter={(value, name, props) => {
														if (name === "earned") return [`$${Number(value).toFixed(2)}`, "earned"];
														if (name === "sales") return [`$${Number(value).toFixed(2)}`, "sales"];
														if (name === "bonus") return [`$${Number(value).toFixed(2)}`, "bonus"];
														return [String(value), String(name)];
													}}
													contentStyle={{
														background: "rgba(10, 16, 34, 0.9)",
														border: "1px solid rgba(86, 104, 140, 0.5)",
														borderRadius: "10px",
														color: "#e2e8f0",
													}}
												/>
												<Line
													type="monotone"
													dataKey="earned"
													stroke="#d6dde8"
													strokeWidth={3}
													dot={{ r: 3, stroke: "#e6edf6", strokeWidth: 1, fill: "#d6dde8" }}
													activeDot={{ r: 5, stroke: "#e6edf6", strokeWidth: 2, fill: "#1f2633" }}
												/>
											</LineChart>
										</ResponsiveContainer>
									) : (
										<p className="text-sm text-slate-400">No daily data available.</p>
									)}
									{monthEstimate && (
										<div className="mt-4 space-y-3 text-sm">
											{(() => {
												const monthStart = startOfMonth(calendarMonth || new Date());
												const monthSales = getMonthSales(monthStart);
												const nextThreshold = (Math.floor(monthSales / 10000) + 1) * 10000;
												const progressPct = Math.min(100, Math.max(0, (monthSales / nextThreshold) * 100));
												return (
													<>
														<div className="flex items-center justify-between">
															<span className="text-slate-400">
																Progress to {formatCurrency(nextThreshold, 0)} bonus
															</span>
															<span className="text-slate-100 font-semibold tabular-nums">
																{formatCurrency(monthSales, 0)}
															</span>
														</div>
														<Progress value={progressPct} className="h-2 bg-slate-200" />
													</>
												);
											})()}
											<div className="flex items-center justify-between">
												<span className="text-slate-400">Estimated month earnings</span>
												<span className="text-slate-100 font-semibold tabular-nums">
													{formatCurrency(monthEstimate.estimate)}
												</span>
											</div>
											<Progress
												value={Math.min(100, Math.max(0, (monthEstimate.estimate / monthEstimate.ideal) * 100))}
												className="h-2 bg-slate-200"
											/>
											<div className="flex items-center justify-between">
												<span className="text-slate-400">Ideal month</span>
												<span className="text-slate-100 font-semibold tabular-nums">
													{formatCurrency(monthEstimate.ideal)}
												</span>
											</div>
											<Progress value={100} className="h-2 bg-slate-200" />
										</div>
									)}
									{currentPeriod && (
										<div className="mt-4 space-y-3 text-sm">
											<div className="flex items-center justify-between">
												<span className="text-slate-400">Bonuses (current cut)</span>
												<span className="text-slate-100 font-semibold tabular-nums">
													{formatCurrency(totalCutBonuses)}
												</span>
											</div>
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
												<div className="rounded border border-slate-700/60 bg-slate-800/70 p-3 chatter-panel">
													<p className="text-xs uppercase text-slate-300">Shift bonuses</p>
													<ul className="mt-2 space-y-1 text-sm text-slate-200">
														{currentCutShiftBonuses.length === 0 && <li>No bonuses</li>}
														{currentCutShiftBonuses.map((entry) => (
															<li key={`${entry.date}-${entry.amount}`}>
																{entry.date} • ${Number(entry.amount || 0).toFixed(2)}
															</li>
														))}
													</ul>
												</div>
												<div className="rounded border border-slate-700/60 bg-slate-800/70 p-3 chatter-panel">
													<p className="text-xs uppercase text-slate-300">Double shift</p>
													<ul className="mt-2 space-y-1 text-sm text-slate-200">
														{bonusEntriesByType.double_shift.length === 0 && <li>No bonuses</li>}
														{bonusEntriesByType.double_shift.map((entry) => (
															<li key={entry.id}>
																{entry.date} • ${Number(entry.amount || 0).toFixed(2)}
															</li>
														))}
													</ul>
												</div>
												<div className="rounded border border-slate-700/60 bg-slate-800/70 p-3 chatter-panel">
													<p className="text-xs uppercase text-slate-300">Holiday bonuses</p>
													<ul className="mt-2 space-y-1 text-sm text-slate-200">
														{bonusEntriesByType.holiday.length === 0 && <li>No bonuses</li>}
														{bonusEntriesByType.holiday.map((entry) => (
															<li key={entry.id}>
																{entry.date} • ${Number(entry.amount || 0).toFixed(2)}
															</li>
														))}
													</ul>
												</div>
												<div className="rounded border border-slate-700/60 bg-slate-800/70 p-3 chatter-panel">
													<p className="text-xs uppercase text-slate-300">Performance bonus</p>
													<ul className="mt-2 space-y-1 text-sm text-slate-200">
														{performanceBonusCurrentCut > 0 ? (
															<li>{formatCurrency(performanceBonusCurrentCut)}</li>
														) : (
															<li>No bonus</li>
														)}
													</ul>
												</div>
											</div>
											{isBulzeUser && (
												<div className="mt-4 space-y-3 text-sm">
													<div className="flex flex-wrap items-center justify-between gap-2">
														<span className="text-slate-400">
															Bulze share (1% of assigned chatters{calendarMonth ? `, ${format(calendarMonth, "MMM yyyy")}` : ""})
														</span>
														<div className="flex items-center gap-2">
															<Button
																variant="outline"
																size="sm"
																onClick={() => calendarMonth && setCalendarMonth(subMonths(calendarMonth, 1))}
																disabled={!calendarMonth}
															>
																Prev
															</Button>
															<Button
																variant="outline"
																size="sm"
																onClick={() => calendarMonth && setCalendarMonth(addMonths(calendarMonth, 1))}
																disabled={!calendarMonth}
															>
																Next
															</Button>
															<span className="text-slate-100 font-semibold tabular-nums">
																{formatCurrency(bulzeMonthlyTotal)}
															</span>
															{bulzeMonthlyEarnings.length > 0 && (
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => setShowBulzeDetails((prev) => !prev)}
																>
																	{showBulzeDetails ? "Hide" : "Show all"}
																</Button>
															)}
														</div>
													</div>
													{bulzeMonthlyEarnings.length === 0 && (
														<p className="text-slate-500">No assigned chatters yet.</p>
													)}
													{showBulzeDetails && bulzeMonthlyEarnings.length > 0 && (
														<div className="rounded border border-slate-700/60 bg-slate-800/70 p-3 chatter-panel">
															<table className="w-full text-sm">
																<thead>
																	<tr className="text-left text-slate-400">
																		<th className="pb-2">Chatter</th>
																		<th className="pb-2">Inflow</th>
																		<th className="pb-2 text-right">Monthly sales</th>
																		<th className="pb-2 text-right">Bulze 1%</th>
																	</tr>
																</thead>
																<tbody className="text-slate-200">
																	{bulzeMonthlyEarnings.map((entry) => (
																		<tr key={entry.user.id} className="border-t border-slate-700/60">
																			<td className="py-2">{entry.user.name || entry.user.email}</td>
																			<td className="py-2 text-slate-400">{entry.user.inflow_username || "-"}</td>
																			<td className="py-2 text-right">{formatCurrency(entry.sales)}</td>
																			<td className="py-2 text-right text-emerald-300">{formatCurrency(entry.earned)}</td>
																		</tr>
																	))}
																</tbody>
															</table>
														</div>
													)}
												</div>
											)}
										</div>
									)}
								</CardContent>
							</Card>

							<Card className="chatter-panel">
								<CardHeader className="flex flex-row items-center justify-between gap-2">
									<div>
										<CardTitle className="text-sm text-slate-200">Earnings Calendar</CardTitle>
										{calendarMonth && (
											<CardDescription className="text-slate-400">
												{format(calendarMonth, "MMMM yyyy")}
											</CardDescription>
										)}
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => calendarMonth && setCalendarMonth(subMonths(calendarMonth, 1))}
											disabled={!calendarMonth}
										>
											Prev
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => calendarMonth && setCalendarMonth(addMonths(calendarMonth, 1))}
											disabled={!calendarMonth}
										>
											Next
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									{calendarMonth && payPeriods.length > 0 && (
										<div className="mb-4 space-y-2 text-sm">
											{payPeriods
												.filter((p) => {
													const monthStart = startOfMonth(calendarMonth);
													const monthEnd = endOfMonth(calendarMonth);
													const periodEnd = subDays(p.endExclusive, 1);
													return p.start <= monthEnd && periodEnd >= monthStart;
												})
												.map((p) => (
													<div
														key={p.key}
														className="flex items-center justify-between rounded border border-slate-700/60 bg-slate-800/60 px-3 py-2"
													>
														<span className="text-slate-300">Cut {format(p.start, "MMM d")} to {format(subDays(p.endExclusive, 1), "MMM d")}</span>
														<span className="font-semibold text-amber-300">{formatCurrency(p.total, 2)}</span>
													</div>
												))}
										</div>
									)}
									{calendarMonth ? (
										<div className="grid grid-cols-7 gap-3 text-xs calendar-grid">
											{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
												<div key={d} className="text-slate-400 text-center">
													{d}
												</div>
											))}
											{calendarDays.map((day) => {
												const key = format(day, "yyyy-MM-dd");
												const salesAmount = salesByDay.get(key) ?? 0;
												const dayBonus = bonusByDay.get(key) ?? 0;
												const cutoff = payPeriodByCutoff.get(key);
												const muted = !isSameMonth(day, calendarMonth);
												const salesClass = salesAmount >= 1000
													? "calendar-cell-strong"
													: salesAmount >= 500
														? "calendar-cell-mid"
														: salesAmount > 0 && salesAmount < 200
															? "calendar-cell-low"
															: "";
												return (
													<div
														key={key}
														className={[
															"rounded border p-3 min-h-[96px] calendar-cell",
															"border-slate-200",
															cutoff ? "calendar-cutoff" : "calendar-base",
															salesClass,
															muted ? "opacity-40" : "",
														].join(" ")}
													>
														<div className="flex justify-between text-slate-300">
															<span className="calendar-day">{format(day, "d")}</span>
															<span className="calendar-amount">
																{salesAmount ? formatCurrency(salesAmount, 0) : ""}
															</span>
														</div>
														{cutoff && <span className="calendar-cut">CUT</span>}
														{dayBonus > 0 && (
															<span className="calendar-badge">
																{formatCurrency(dayBonus, 0)}
															</span>
														)}
													</div>
												);
											})}
										</div>
									) : (
										<p className="text-sm text-slate-400">No calendar range.</p>
									)}
								</CardContent>
							</Card>
						</div>
					</div>
				)}
				{employee?.insights && employee.insights.length > 0 && (
					<div className="space-y-2">
						<Label className="text-slate-300">Insights</Label>
						<ul className="list-disc list-inside text-slate-300 space-y-1">
							{employee.insights.map((insight, idx) => (
								<li key={idx}>{insight}</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function VideoPlayer({
	video,
	userId,
	onComplete,
	onBack,
	variant = "training",
}: {
	video: VideosModel;
	userId: string;
	onComplete: () => void;
	onBack: () => void;
	variant?: "training" | "daily";
}) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [maxWatchedTime, setMaxWatchedTime] = useState(0);
	const [hasWatchedFull, setHasWatchedFull] = useState(false);
	const [skipBlocked, setSkipBlocked] = useState(false);
	const [showCompletionConfetti, setShowCompletionConfetti] = useState(false);
	const [ytPlayer, setYtPlayer] = useState<any>(null);
	const [ytDuration, setYtDuration] = useState(0);
	const [loomPlayer, setLoomPlayer] = useState<any>(null);
	const [vimeoDuration, setVimeoDuration] = useState(0);
	const [vimeoError, setVimeoError] = useState<string | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const loomIframeRef = useRef<HTMLIFrameElement>(null);
	const vimeoIframeRef = useRef<HTMLIFrameElement>(null);
	const ytIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const maxWatchedTimeRef = useRef(0);
	const lastAutoSaveRef = useRef(0);
	const vimeoPlayerRef = useRef<Player | null>(null);
	const completionSeenRef = useRef(false);
	const queryClient = useQueryClient();

	const progressOrm = UserProgressORM.getInstance();

	// Check if video is YouTube, Loom, or Vimeo
	const youtubeId = getYouTubeVideoId(video.url);
	const loomId = getLoomVideoId(video.url);
	const vimeoId = getVimeoVideoId(video.url);
	const isYouTube = youtubeId !== null;
	const isLoom = loomId !== null;
	const isVimeo = vimeoId !== null;

	const { data: existingProgress } = useQuery({
		queryKey: ["videoProgress", userId, video.id],
		queryFn: async () => {
			const progress = await progressOrm.getUserProgressByUserIdVideoId(userId, video.id);
			return progress[0] || null;
		},
	});

	useEffect(() => {
		if (existingProgress?.is_completed) {
			setHasWatchedFull(true);
			completionSeenRef.current = true;
		}
	}, [existingProgress]);

	// Reset video when component mounts or video changes
	useEffect(() => {
		setIsPlaying(false);
		setVimeoDuration(0);
		setVimeoError(null);
		completionSeenRef.current = false;
		const savedTime = existingProgress?.current_timestamp_watched || 0;
		setCurrentTime(savedTime);
		setMaxWatchedTime(savedTime);
		maxWatchedTimeRef.current = savedTime;

		if (videoRef.current) {
			videoRef.current.currentTime = savedTime;
		}
	}, [video.id, existingProgress?.current_timestamp_watched]);

	// YouTube IFrame API initialization
	useEffect(() => {
		if (!isYouTube) return;

		// Load YouTube IFrame API
		if (!(window as any).YT) {
			const tag = document.createElement("script");
			tag.src = "https://www.youtube.com/iframe_api";
			const firstScriptTag = document.getElementsByTagName("script")[0];
			firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
		}

		// Initialize player when API is ready
		const initPlayer = () => {
			if (iframeRef.current && (window as any).YT && youtubeId) {
				const player = new (window as any).YT.Player(`youtube-player-${video.id}`, {
					height: "100%",
					width: "100%",
					videoId: youtubeId,
					playerVars: {
						enablejsapi: 1,
						modestbranding: 1,
						controls: 0,
						disablekb: 1,
						fs: 0,
						iv_load_policy: 3,
						rel: 0,
						origin: window.location.origin,
					},
					events: {
						onReady: (event: any) => {
							console.log("YouTube player ready");
							const duration = event?.target?.getDuration?.() || 0;
							if (duration > 0) {
								setYtDuration(duration);
							}
						},
						onStateChange: (event: any) => {
							// 1 = playing, 2 = paused, 0 = ended
							if (event.data === 1) {
								setIsPlaying(true);
								startWatchTimeTracking(event.target);
							} else if (event.data === 0) {
								// Video ended
								setIsPlaying(false);
								setHasWatchedFull(true);
								saveProgress.mutate(true);
								stopWatchTimeTracking();
							} else {
								setIsPlaying(false);
								stopWatchTimeTracking();
							}
						},
					},
				});
				setYtPlayer(player);
			}
		};

		if ((window as any).YT && (window as any).YT.Player) {
			initPlayer();
		} else {
			(window as any).onYouTubeIframeAPIReady = initPlayer;
		}

		return () => {
			stopWatchTimeTracking();
		};
	}, [isYouTube, youtubeId]);

	useEffect(() => {
		if (!ytPlayer?.getDuration) return;
		const duration = ytPlayer.getDuration();
		if (duration > 0) {
			setYtDuration(duration);
		}
	}, [ytPlayer]);

	// Loom SDK initialization and tracking
	useEffect(() => {
		if (!isLoom || !loomIframeRef.current) return;

		const iframe = loomIframeRef.current;
		let trackingInterval: NodeJS.Timeout;

		// Listen for Loom player events via postMessage
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== "https://www.loom.com") return;

			const data = event.data;

			// Loom SDK sends messages with 'method' field for responses
			if (data.method === "getCurrentTime") {
				const time = data.value || 0;
				enforceNoSkip(time, video.duration, "loom");
			} else if (data.method === "getDuration") {
				// Duration received from Loom
				const duration = data.value;
				if (duration && duration !== video.duration) {
					console.log("Loom duration:", duration);
				}
			}
		};

		window.addEventListener("message", handleMessage);

		// Poll for current time every 500ms
		trackingInterval = setInterval(() => {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage(
					{
						method: "getCurrentTime",
						value: null,
					},
					"https://www.loom.com"
				);
			}
		}, 500);

		return () => {
			window.removeEventListener("message", handleMessage);
			if (trackingInterval) clearInterval(trackingInterval);
		};
	}, [isLoom, loomId, hasWatchedFull, video.duration]);

	// Vimeo player initialization and tracking
	useEffect(() => {
		if (!isVimeo || !vimeoIframeRef.current || !vimeoId) return;

		const player = new Player(vimeoIframeRef.current);
		vimeoPlayerRef.current = player;

		const handleLoaded = async () => {
			try {
				const duration = await player.getDuration();
				if (duration > 0) {
					setVimeoDuration(duration);
				}
				const savedTime = existingProgress?.current_timestamp_watched || 0;
				if (savedTime > 0) {
					await player.setCurrentTime(savedTime);
				}
			} catch (error) {
				console.warn("Failed to initialize Vimeo player:", error);
				setVimeoError("Unable to load Vimeo video. Check embed permissions.");
			}
		};

		const handleTimeUpdate = (data: { seconds: number; duration: number }) => {
			const duration = data.duration || vimeoDuration || video.duration;
			enforceNoSkip(data.seconds, duration, "vimeo");
		};

		const handlePlay = () => {
			setIsPlaying(true);
		};

		const handlePause = () => {
			setIsPlaying(false);
		};

		const handleEnded = () => {
			setIsPlaying(false);
			setHasWatchedFull(true);
			saveProgress.mutate(true);
		};

		const handleError = () => {
			setVimeoError("Unable to play Vimeo video. Check privacy settings.");
		};

		player.on("loaded", handleLoaded);
		player.on("timeupdate", handleTimeUpdate);
		player.on("play", handlePlay);
		player.on("pause", handlePause);
		player.on("ended", handleEnded);
		player.on("error", handleError);

		return () => {
			player.off("loaded", handleLoaded);
			player.off("timeupdate", handleTimeUpdate);
			player.off("play", handlePlay);
			player.off("pause", handlePause);
			player.off("ended", handleEnded);
			player.off("error", handleError);
			player.destroy();
			vimeoPlayerRef.current = null;
		};
	}, [isVimeo, vimeoId, video.duration, existingProgress?.current_timestamp_watched]);

	const skipBufferSeconds = 1.5;

	const updateMaxWatchedTime = (time: number) => {
		setMaxWatchedTime((prev) => {
			const next = time > prev ? time : prev;
			maxWatchedTimeRef.current = next;
			return next;
		});
	};

	const enforceNoSkip = (
		time: number,
		duration: number,
		source: "html" | "youtube" | "loom" | "vimeo",
	) => {
		const maxAllowed = maxWatchedTimeRef.current + skipBufferSeconds;
		setCurrentTime(time);

		if (time > maxAllowed) {
			setSkipBlocked(true);
			const target = maxWatchedTimeRef.current;

			if (source === "html" && videoRef.current) {
				videoRef.current.currentTime = target;
			}
			if (source === "youtube" && ytPlayer?.seekTo) {
				ytPlayer.seekTo(target, true);
			}
			if (source === "loom" && loomIframeRef.current?.contentWindow) {
				loomIframeRef.current.contentWindow.postMessage(
					{ method: "setCurrentTime", value: target },
					"https://www.loom.com",
				);
			}
			if (source === "vimeo" && vimeoPlayerRef.current?.setCurrentTime) {
				vimeoPlayerRef.current.setCurrentTime(target).catch(() => {});
			}

			return;
		}

		if (skipBlocked) {
			setSkipBlocked(false);
		}

		if (time > maxWatchedTimeRef.current) {
			updateMaxWatchedTime(time);
		}

		const effectiveMax = Math.max(time, maxWatchedTimeRef.current);
		if (!hasWatchedFull && duration > 0 && effectiveMax >= duration * 0.95) {
			setHasWatchedFull(true);
			saveProgress.mutate(true);
		}
	};

	const startWatchTimeTracking = (player: any) => {
		if (ytIntervalRef.current) {
			clearInterval(ytIntervalRef.current);
		}

		ytIntervalRef.current = setInterval(() => {
			if (player && player.getCurrentTime) {
				const time = player.getCurrentTime();
				const duration = player.getDuration();
				enforceNoSkip(time, duration, "youtube");
			}
		}, 1000);
	};

	const stopWatchTimeTracking = () => {
		if (ytIntervalRef.current) {
			clearInterval(ytIntervalRef.current);
			ytIntervalRef.current = null;
		}
	};

	const saveProgress = useMutation({
		mutationFn: async (completed: boolean) => {
			const watchedTime = Math.floor(maxWatchedTimeRef.current);
			if (existingProgress) {
				await progressOrm.setUserProgressByUserIdVideoId(userId, video.id, {
					...existingProgress,
					is_completed: completed,
					current_timestamp_watched: watchedTime,
					completed_at: completed ? Math.floor(Date.now() / 1000).toString() : existingProgress.completed_at,
				});
			} else {
				await progressOrm.insertUserProgress([
					{
						user_id: userId,
						video_id: video.id,
						is_completed: completed,
						current_timestamp_watched: watchedTime,
						completed_at: completed ? Math.floor(Date.now() / 1000).toString() : null,
					} as UserProgressModel,
				]);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["videoProgress", userId, video.id] });
			queryClient.invalidateQueries({ queryKey: ["userProgress", userId] });
		},
	});

	useEffect(() => {
		if (variant !== "daily" || !hasWatchedFull || completionSeenRef.current) return;
		completionSeenRef.current = true;
		setShowCompletionConfetti(true);
		const timer = window.setTimeout(() => setShowCompletionConfetti(false), 2800);
		return () => window.clearTimeout(timer);
	}, [variant, hasWatchedFull]);

	const handleTimeUpdate = () => {
		if (videoRef.current) {
			const time = videoRef.current.currentTime;
			enforceNoSkip(time, video.duration, "html");

			const watchedTime = Math.floor(maxWatchedTimeRef.current);
			if (watchedTime > 0 && watchedTime % 5 === 0 && watchedTime !== lastAutoSaveRef.current) {
				lastAutoSaveRef.current = watchedTime;
				saveProgress.mutate(false);
			}
		}
	};

	const handleSeeking = () => {
		if (videoRef.current) {
			const time = videoRef.current.currentTime;

			// Prevent skipping forward beyond what user has watched (with 2 second buffer)
			if (time > maxWatchedTimeRef.current + skipBufferSeconds) {
				videoRef.current.currentTime = maxWatchedTimeRef.current;
			}
		}
	};

	const togglePlay = async () => {
		if (videoRef.current) {
			try {
				if (isPlaying) {
					videoRef.current.pause();
					setIsPlaying(false);
				} else {
					await videoRef.current.play();
					setIsPlaying(true);
				}
			} catch (error) {
				console.error("Video playback error:", error);
				setIsPlaying(false);
			}
		}
	};

	const restartVideo = () => {
		if (videoRef.current) {
			videoRef.current.currentTime = 0;
			setCurrentTime(0);
			setIsPlaying(false);
		}
	};

	const progress = video.duration ? (maxWatchedTime / video.duration) * 100 : 0;

	return (
		<div className="space-y-6">
			<Card className="chatter-panel">
				<CardHeader>
					<div className="flex justify-between items-start">
						<div>
							<CardTitle className="text-slate-100">{video.title}</CardTitle>
							<CardDescription className="text-slate-400">{video.description}</CardDescription>
						</div>
						<Button variant="outline" onClick={onBack} className="border-slate-700 hover:bg-slate-800">
							Back
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="relative bg-black rounded-lg overflow-hidden aspect-video">
						{isYouTube ? (
							<div
								ref={iframeRef}
								className="w-full h-full"
								id={`youtube-player-${video.id}`}
							/>
						) : isLoom ? (
							<iframe
								ref={loomIframeRef}
								src={`https://www.loom.com/embed/${loomId}?sid=sdk`}
								frameBorder="0"
								allowFullScreen
								className="w-full h-full"
								title={video.title}
								allow="autoplay"
							/>
						) : isVimeo ? (
							<>
								<iframe
									ref={vimeoIframeRef}
									src={`https://player.vimeo.com/video/${vimeoId}?dnt=1&transparent=0&title=0&byline=0&portrait=0&controls=0&keyboard=0`}
									frameBorder="0"
									allow="autoplay; fullscreen; picture-in-picture"
									allowFullScreen
									className="w-full h-full"
									title={video.title}
								/>
								{!isPlaying && (
									<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
										<Button
											size="lg"
											onClick={async () => {
												try {
													await vimeoPlayerRef.current?.play();
												} catch (error) {
													console.error("Vimeo playback error:", error);
													setVimeoError("Unable to start playback. Check Vimeo settings.");
												}
											}}
											className="rounded-full w-16 h-16"
											variant="default"
										>
											<Play className="w-8 h-8" />
										</Button>
									</div>
								)}
								{vimeoError && (
									<div className="absolute bottom-3 left-3 right-3 z-20">
										<Alert className="bg-red-900/70 border-red-700">
											<AlertDescription className="text-red-200">
												{vimeoError}
											</AlertDescription>
										</Alert>
									</div>
								)}
							</>
						) : (
							<>
								<video
									ref={videoRef}
									src={video.url}
									className="w-full h-full"
									onTimeUpdate={handleTimeUpdate}
									onSeeking={handleSeeking}
									onEnded={() => {
										setIsPlaying(false);
										if (maxWatchedTimeRef.current >= video.duration * 0.95) {
											setHasWatchedFull(true);
											saveProgress.mutate(true);
										}
									}}
								/>
								<div className="absolute inset-0 flex items-center justify-center">
									<Button
										size="lg"
										onClick={togglePlay}
										className="rounded-full w-16 h-16"
										variant={isPlaying ? "secondary" : "default"}
									>
										{isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
									</Button>
								</div>
							</>
						)}
						{variant === "daily" && hasWatchedFull && (
							<div className="daily-video-complete">
								<div className="daily-video-complete-badge">
									<CheckCircle2 className="h-5 w-5" />
									<span>Completed</span>
								</div>
							</div>
						)}
						{variant === "daily" && showCompletionConfetti && (
							<div className="daily-video-confetti">
								{Array.from({ length: 16 }).map((_, idx) => (
									<span key={idx} style={{ ["--i" as string]: idx }} />
								))}
							</div>
						)}
					</div>

					{skipBlocked && (
						<Alert className="bg-amber-900/40 border-amber-600">
							<AlertDescription className="text-amber-200">
								Ne preskaci ili premotavaj video. Pusti ga do kraja da bi se racunao.
							</AlertDescription>
						</Alert>
					)}

					{!isYouTube && !isLoom && !isVimeo && (
						<>
							<div className="space-y-2">
								<div className="flex justify-between items-center text-sm text-slate-600">
									<span>Progress</span>
									<div className="flex items-center gap-2">
										<span>
											{Math.floor(maxWatchedTime)}s / {video.duration}s
										</span>
										<Button
											onClick={restartVideo}
											variant="ghost"
											size="sm"
											className="h-6 px-2 text-xs"
										>
											Restart
										</Button>
									</div>
								</div>
								<Progress value={progress} className="h-2" />
							</div>

							{hasWatchedFull && (
								<Alert className="bg-green-50 border-green-200">
									<CheckCircle2 className="h-4 w-4 text-green-600" />
									<AlertDescription className="text-green-800">
										Video completed! You can now proceed to the quiz.
									</AlertDescription>
								</Alert>
							)}
						</>
					)}

					{isYouTube && (
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="flex justify-between items-center text-sm text-slate-600">
									<span>Progress</span>
									<span>
										{Math.floor(maxWatchedTime)}s / {ytDuration ? Math.floor(ytDuration) : video.duration ? Math.floor(video.duration) : "?"}s
									</span>
								</div>
								<Progress
									value={ytDuration ? (maxWatchedTime / ytDuration) * 100 : video.duration ? (maxWatchedTime / video.duration) * 100 : 0}
									className="h-2"
								/>
							</div>

							{!hasWatchedFull && (
								<Alert className="bg-blue-50 border-blue-200">
									<AlertDescription className="text-blue-800">
										{variant === "daily"
											? `Watch at least 95% to mark complete. Current progress: ${ytDuration ? Math.floor((maxWatchedTime / ytDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%`
											: `Watch at least 95% of the video to unlock the quiz. Current progress: ${ytDuration ? Math.floor((maxWatchedTime / ytDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%`}
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-50 border-green-200">
									<CheckCircle2 className="h-4 w-4 text-green-600" />
									<AlertDescription className="text-green-800">
										{variant === "daily"
											? "Video completed! Nice work."
											: "Video completed! You can now proceed to the quiz."}
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}

					{isLoom && (
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="flex justify-between items-center text-sm text-slate-300">
									<span>Progress</span>
									<span>
										{Math.floor(maxWatchedTime)}s / {video.duration}s
									</span>
								</div>
								<Progress value={(maxWatchedTime / video.duration) * 100} className="h-2" />
							</div>

							{!hasWatchedFull && (
								<Alert className="bg-blue-900/50 border-blue-700">
									<AlertDescription className="text-blue-200">
										{variant === "daily"
											? `Watch at least 95% to mark complete. Current progress: ${Math.floor((maxWatchedTime / video.duration) * 100)}%`
											: `Watch at least 95% of the video to unlock the quiz. Current progress: ${Math.floor((maxWatchedTime / video.duration) * 100)}%`}
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-900/50 border-green-700">
									<CheckCircle2 className="h-4 w-4 text-green-400" />
									<AlertDescription className="text-green-200">
										{variant === "daily"
											? "Video completed! Nice work."
											: "Video completed! You can now proceed to the quiz."}
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}

					{isVimeo && (
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="flex justify-between items-center text-sm text-slate-300">
									<span>Progress</span>
									<span>
										{Math.floor(maxWatchedTime)}s / {vimeoDuration ? Math.floor(vimeoDuration) : video.duration ? Math.floor(video.duration) : "?"}s
									</span>
								</div>
								<Progress
									value={vimeoDuration ? (maxWatchedTime / vimeoDuration) * 100 : video.duration ? (maxWatchedTime / video.duration) * 100 : 0}
									className="h-2"
								/>
							</div>

							{!hasWatchedFull && (
								<Alert className="bg-blue-900/50 border-blue-700">
									<AlertDescription className="text-blue-200">
										{variant === "daily"
											? `Watch at least 95% to mark complete. Current progress: ${vimeoDuration ? Math.floor((maxWatchedTime / vimeoDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%`
											: `Watch at least 95% of the video to unlock the quiz. Current progress: ${vimeoDuration ? Math.floor((maxWatchedTime / vimeoDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%`}
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-900/50 border-green-700">
									<CheckCircle2 className="h-4 w-4 text-green-400" />
									<AlertDescription className="text-green-200">
										{variant === "daily"
											? "Video completed! Nice work."
											: "Video completed! You can now proceed to the quiz."}
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}

					{variant !== "daily" && (
						<Button
							onClick={onComplete}
							disabled={!hasWatchedFull}
							className="w-full"
							size="lg"
						>
							{hasWatchedFull ? "Start Quiz" : "Watch full video to unlock quiz"}
						</Button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function QuizInterface({
	videoId,
	userId,
	onComplete,
	onBack,
}: {
	videoId: string;
	userId: string;
	onComplete: (completion: CompletionsModel, meta: { totalQuestions: number; passThreshold: number }) => void;
	onBack: () => void;
}) {
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<number, string>>({});
	const [completedQuestions, setCompletedQuestions] = useState<Set<number>>(new Set());
	const [evaluating, setEvaluating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const queryClient = useQueryClient();
	const questionsOrm = QuestionsORM.getInstance();
	const sessionsOrm = TrainingSessionsORM.getInstance();
	const attemptsOrm = QuizAttemptsORM.getInstance();
	const completionsOrm = CompletionsORM.getInstance();

	const { data: questions = [], isLoading } = useQuery({
		queryKey: ["questions", videoId],
		queryFn: () => questionsOrm.getQuestionsByVideoId(videoId),
	});

	const { data: session } = useQuery({
		queryKey: ["session", videoId],
		queryFn: async () => {
			const sessions = await sessionsOrm.getTrainingSessionsByVideoId(videoId);
			return sessions[0] || null;
		},
	});

	const sortedQuestions = [...questions].sort((a, b) => a.sequence_number - b.sequence_number);
	const currentQuestion = sortedQuestions[currentQuestionIndex];

	const handleNextQuestion = () => {
		if (answers[currentQuestionIndex]?.trim()) {
			setCompletedQuestions(new Set([...completedQuestions, currentQuestionIndex]));
			if (currentQuestionIndex < sortedQuestions.length - 1) {
				setCurrentQuestionIndex(currentQuestionIndex + 1);
			}
		}
	};

	const submitQuiz = async () => {
		if (!session) return;

		setEvaluating(true);
		setError(null);

		try {
			const results: Array<{ isCorrect: boolean; feedback: string; questionId: string }> = [];

			for (let i = 0; i < sortedQuestions.length; i++) {
			const question = sortedQuestions[i];
			const userAnswer = answers[i] || "";

			let isCorrect = false;
			let feedback = "Unable to evaluate answer";

			// Check if ideal answer is a type indicator (Numbers, Text, etc.)
			const idealAnswerLower = question.ideal_answer.trim().toLowerCase();
			const userAnswerTrimmed = userAnswer.trim();
			const idealAnswerTrimmed = question.ideal_answer.trim();

			// FIRST: Check for exact match (case-insensitive)
			if (userAnswerTrimmed.toLowerCase() === idealAnswerTrimmed.toLowerCase()) {
				isCorrect = true;
				feedback = "Correct - Exact match";
			} else if (idealAnswerLower === "numbers" || idealAnswerLower === "number") {
				// Validate that the answer contains numbers
				const hasNumbers = /\d/.test(userAnswerTrimmed);
				const isOnlyNumbers = /^[\d\s.,\-+/()]+$/.test(userAnswerTrimmed);

				if (hasNumbers && isOnlyNumbers) {
					isCorrect = true;
					feedback = "Correct - Valid numeric answer provided";
				} else if (hasNumbers) {
					isCorrect = true;
					feedback = "Correct - Answer contains numbers";
				} else {
					isCorrect = false;
					feedback = "Incorrect - Expected a numeric answer";
				}
			} else if (idealAnswerLower === "text" || idealAnswerLower === "string") {
				// Any non-empty text answer is valid
				isCorrect = userAnswerTrimmed.length > 0;
				feedback = isCorrect ? "Correct - Text answer provided" : "Incorrect - Empty answer";
			} else {
				const grokResult = await evaluateAnswerWithGrok(
					question.text,
					question.ideal_answer,
					userAnswer,
				);

				if (grokResult && typeof grokResult.correct === "boolean") {
					isCorrect = grokResult.correct;
					feedback = grokResult.feedback || feedback;
				} else {
					const localResult = evaluateAnswerLocally(
						question.text,
						question.ideal_answer,
						userAnswer,
					);
					isCorrect = localResult.isCorrect;
					feedback = localResult.feedback;
				}
			}

			results.push({ isCorrect, feedback, questionId: question.id });

				await attemptsOrm.insertQuizAttempts([
					{
						user_id: userId,
						video_id: videoId,
						question_id: question.id,
						user_answer: userAnswer,
						is_correct: isCorrect,
						ai_feedback: feedback,
						attempted_at: Math.floor(Date.now() / 1000).toString(),
					} as QuizAttemptsModel,
				]);
			}

			queryClient.invalidateQueries({ queryKey: ["allQuizAttempts"] });

			const score = results.filter((r) => r.isCorrect).length;
			const [completion] = await completionsOrm.insertCompletions([
				{
					user_id: userId,
					video_id: videoId,
					completion_code: session.verification_code || `TRAIN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
					score,
					completed_at: Math.floor(Date.now() / 1000).toString(),
				} as CompletionsModel,
			]);

			queryClient.invalidateQueries({ queryKey: ["userCompletions", userId] });
			queryClient.invalidateQueries({ queryKey: ["allCompletions"] });
			onComplete(completion, { totalQuestions: sortedQuestions.length, passThreshold: session.pass_threshold });
		} catch (err) {
			setError(`Failed to evaluate answers: ${err instanceof Error ? err.message : "Unknown error"}`);
		} finally {
			setEvaluating(false);
		}
	};

	if (isLoading) {
		return <div className="text-center py-12">Loading quiz...</div>;
	}

	if (sortedQuestions.length === 0) {
		return <div className="text-center py-12">No questions available for this video</div>;
	}

	const canProceed = completedQuestions.has(currentQuestionIndex) || answers[currentQuestionIndex]?.trim();
	const allQuestionsCompleted = completedQuestions.size === sortedQuestions.length ||
		(completedQuestions.size === sortedQuestions.length - 1 && answers[currentQuestionIndex]?.trim());

	return (
		<div className="max-w-3xl mx-auto space-y-6 quiz-shell chatter-neo">
			<Card className="quiz-card chatter-panel">
				<CardHeader>
					<div className="flex justify-between items-center">
						<div>
							<CardTitle className="text-slate-100 quiz-title">Quiz Assessment</CardTitle>
							<CardDescription className="text-slate-400">
								Question {currentQuestionIndex + 1} of {sortedQuestions.length}
								<span className="ml-2 text-green-400">({completedQuestions.size} answered)</span>
							</CardDescription>
						</div>
						<Button variant="outline" onClick={onBack} disabled={evaluating}>
							Back
						</Button>
					</div>
					<Progress value={(completedQuestions.size / sortedQuestions.length) * 100} className="mt-4" />
				</CardHeader>
				<CardContent className="space-y-6">
					{currentQuestion && (
						<div className="space-y-4">
							<div className="p-4 rounded-lg quiz-question">
								<Label className="text-base font-semibold">{currentQuestion.text}</Label>
							</div>

							<div className="space-y-2">
								<Label htmlFor="answer">Your Answer</Label>
								<Textarea
									id="answer"
									value={answers[currentQuestionIndex] || ""}
									onChange={(e) =>
										setAnswers({ ...answers, [currentQuestionIndex]: e.target.value })
									}
									placeholder="Type your answer here..."
									rows={6}
									disabled={evaluating || completedQuestions.has(currentQuestionIndex)}
								/>
								{completedQuestions.has(currentQuestionIndex) && (
									<p className="text-sm text-green-600 flex items-center gap-1">
										<CheckCircle2 className="w-4 h-4" /> Answer submitted
									</p>
								)}
							</div>
						</div>
					)}

					{error && (
						<Alert variant="destructive">
							<XCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex justify-between gap-4">
						<Button
							onClick={() => {
								const prevIndex = Math.max(0, currentQuestionIndex - 1);
								if (completedQuestions.has(prevIndex) || prevIndex === 0) {
									setCurrentQuestionIndex(prevIndex);
								}
							}}
							disabled={currentQuestionIndex === 0 || evaluating}
							variant="outline"
						>
							Previous
						</Button>

						{currentQuestionIndex < sortedQuestions.length - 1 ? (
							<Button
								onClick={handleNextQuestion}
								disabled={!canProceed || evaluating}
								className="quiz-action"
							>
								{completedQuestions.has(currentQuestionIndex) ? "Next Question" : "Save & Next"}
							</Button>
						) : (
							<Button
								onClick={submitQuiz}
								disabled={!allQuestionsCompleted || evaluating}
								className="bg-green-600 hover:bg-green-700 quiz-action"
							>
								{evaluating ? "Evaluating..." : "Submit All Answers"}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function CompletionScreen({
	completion,
	totalQuestions,
	passThreshold,
	onReset,
}: {
	completion: CompletionsModel;
	totalQuestions: number;
	passThreshold: number;
	onReset: () => void;
}) {
	const belowAverage = completion.score < passThreshold;
	return (
		<div className="max-w-2xl mx-auto">
			<Card className="quiz-card border-green-800 chatter-panel">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center">
							<Trophy className="w-12 h-12 text-white" />
						</div>
					</div>
					<CardTitle className="text-3xl text-green-400 quiz-title">Congratulations!</CardTitle>
					<CardDescription className="text-green-300 text-lg">
						You have successfully completed the training
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="bg-slate-800 rounded-lg p-6 space-y-4">
						<div className="flex justify-between items-center text-lg">
							<span className="text-slate-600">Your Score:</span>
							<span className="font-bold text-2xl text-green-600">{completion.score}/{totalQuestions}</span>
						</div>

						<Separator />

						<div className="space-y-2">
							<Label className="text-slate-600 font-semibold text-base">Your Verification Code</Label>
							<div className="flex gap-2">
								<Input
									value={completion.completion_code}
									readOnly
									className="font-mono text-2xl font-bold text-center bg-slate-50 border-2 border-green-500"
								/>
								<Button
									onClick={() => {
										navigator.clipboard.writeText(completion.completion_code);
									}}
									variant="outline"
									size="lg"
								>
									Copy
								</Button>
							</div>
							<Alert className="bg-blue-50 border-blue-200">
								<AlertDescription className="text-blue-900">
									<strong>Important:</strong> Save this verification code and submit it to your administrator to confirm your training completion.
								</AlertDescription>
							</Alert>
							<div className="text-sm text-slate-600">
								<div className="font-medium">Score: {completion.score}/{totalQuestions}</div>
								{belowAverage ? (
									<div className="text-amber-600">
										You passed, but there is room to grow. Consider rewatching the video to strengthen your score.
									</div>
								) : (
									<div className="text-green-600">Great work. You are ready to move forward.</div>
								)}
							</div>
						</div>
					</div>

					<Button onClick={onReset} className="w-full" size="lg">
						Back to Training Videos
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function PendingApprovalScreen({ user, onLogout }: { user: UsersModel; onLogout: () => void }) {
	return (
		<div className="min-h-screen app-shell flex items-center justify-center px-4">
			<Card className="w-full max-w-lg chatter-panel">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl text-slate-100">Approval Required</CardTitle>
					<CardDescription className="text-slate-400">
						Your account is waiting for admin approval.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 text-center">
					<p className="text-slate-300">
						Hi {user.name}, your account has been created. Please wait for admin approval.
					</p>
					<Button variant="outline" onClick={onLogout}>
						Logout
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function LoginScreen({ onLogin }: { onLogin: (user: UsersModel) => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [discordUsername, setDiscordUsername] = useState("");
	const [discordNickname, setDiscordNickname] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showAdminLogin, setShowAdminLogin] = useState(false);
	const [adminPassword, setAdminPassword] = useState("");

	const usersOrm = UsersORM.getInstance();

	// Create admin user if not exists
	const ensureAdminExists = async () => {
		try {
			const [existingAdmins] = await usersOrm.listUsers({
				simples: [
					{
						symbol: SimpleSelector.equal,
						field: "email",
						value: CreateValue(DataType.string, ADMIN_EMAIL),
					},
				],
				multiples: [],
				groups: [],
				unwinds: [],
			});

			if (existingAdmins.length === 0) {
				// Create admin user
				await usersOrm.insertUsers([
					{
						name: "Admin",
						email: ADMIN_EMAIL,
						is_admin: true,
						is_approved: true,
						role: "admin",
						password: null,
					} as UsersModel,
				]);
				return;
			}

			const admin = existingAdmins[0];
			if (!admin.is_admin || !admin.is_approved || admin.role !== "admin" || admin.password !== null) {
				await usersOrm.setUsersById(admin.id, {
					...admin,
					is_admin: true,
					is_approved: true,
					role: "admin",
					password: null,
				});
			}
		} catch (err) {
			console.error("Failed to create admin user:", err);
		}
	};

	// Ensure admin exists on mount
	useEffect(() => {
		ensureAdminExists();
	}, []);

	const handleAdminLogin = async () => {
		if (!adminPassword.trim()) {
			setError("Please enter admin password");
			return;
		}

		if (adminPassword !== ADMIN_PASSWORD) {
			setError("Invalid admin credentials");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const [admins] = await usersOrm.listUsers({
				simples: [
					{
						symbol: SimpleSelector.equal,
						field: "email",
						value: CreateValue(DataType.string, ADMIN_EMAIL),
					},
				],
				multiples: [],
				groups: [],
				unwinds: [],
			});

			if (admins.length === 0) {
				await ensureAdminExists();
			}

			const [adminUser] = await usersOrm.listUsers({
				simples: [
					{
						symbol: SimpleSelector.equal,
						field: "email",
						value: CreateValue(DataType.string, ADMIN_EMAIL),
					},
				],
				multiples: [],
				groups: [],
				unwinds: [],
			});

			if (!adminUser) {
				setError("Admin account not found");
				return;
			}

			let finalAdmin = adminUser;
			if (!adminUser.is_admin || !adminUser.is_approved || adminUser.role !== "admin" || adminUser.password !== null) {
				finalAdmin = {
					...adminUser,
					is_admin: true,
					is_approved: true,
					role: "admin",
					password: null,
				};
				await usersOrm.setUsersById(adminUser.id, finalAdmin);
			}

			onLogin(finalAdmin);
		} catch (err) {
			setError(`Failed to login: ${err instanceof Error ? err.message : "Unknown error"}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleLogin = async () => {
		if (!name.trim() || !email.trim() || !discordUsername.trim() || !discordNickname.trim() || !password.trim()) {
			setError("Please fill in all fields");
			return;
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			setError("Please enter a valid email address");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Check if user with this email already exists
			const [existingUsers] = await usersOrm.listUsers({
				simples: [
					{
						symbol: SimpleSelector.equal,
						field: "email",
						value: CreateValue(DataType.string, email.toLowerCase()),
					},
				],
				multiples: [],
				groups: [],
				unwinds: [],
			});

			let user: UsersModel;

			if (existingUsers.length > 0) {
				// User exists, use existing account
				user = existingUsers[0];
				if (user.password && user.password !== password.trim()) {
					setError("Invalid email or password");
					return;
				}
			} else {
				// Create new user
				const [newUser] = await usersOrm.insertUsers([
					{
						name: name.trim(),
						email: email.toLowerCase().trim(),
						is_admin: false,
						is_approved: false,
						role: DEFAULT_ROLE,
						discord_username: discordUsername.trim(),
						discord_nickname: discordNickname.trim(),
						inflow_username: "",
						password: password.trim(),
					} as UsersModel,
				]);
				user = newUser;
			}

			onLogin(user);
		} catch (err) {
			setError(`Failed to login: ${err instanceof Error ? err.message : "Unknown error"}`);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen login-shell flex items-center justify-center px-4">
			<Card className="w-full max-w-md login-card">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className={cn(
							"w-16 h-16 rounded-full flex items-center justify-center",
							showAdminLogin ? "bg-red-600" : "bg-blue-600"
						)}>
							<UserCircle className="w-10 h-10 text-white" />
						</div>
					</div>
					<CardTitle className="text-2xl text-slate-100 login-title">
						{showAdminLogin ? "Admin Login" : "Welcome to Training Platform"}
					</CardTitle>
					<CardDescription className="text-slate-400 login-subtitle">
						{showAdminLogin ? "Enter admin credentials" : "Enter your details to access training videos"}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{!showAdminLogin ? (
						<>
							<div className="space-y-2">
								<Label htmlFor="name">Full Name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="John Doe"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="discordUsername">Discord Username</Label>
								<Input
									id="discordUsername"
									value={discordUsername}
									onChange={(e) => setDiscordUsername(e.target.value)}
									placeholder="discord_user"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="discordNickname">Discord Nickname</Label>
								<Input
									id="discordNickname"
									value={discordNickname}
									onChange={(e) => setDiscordNickname(e.target.value)}
									placeholder="Your Discord nickname"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="email">Email Address</Label>
								<Input
									id="email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="john@example.com"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Create a password"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							{error && (
								<Alert variant="destructive">
									<XCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<Button onClick={handleLogin} disabled={isLoading} className="w-full login-primary" size="lg">
								{isLoading ? "Loading..." : "Continue"}
							</Button>

							<Separator />

							<Button
								onClick={() => {
									setShowAdminLogin(true);
									setError(null);
									setAdminPassword("");
								}}
								variant="outline"
								className="w-full login-ghost"
							>
								<Settings className="w-4 h-4 mr-2" />
								Admin Login
							</Button>

							<p className="text-sm text-slate-500 text-center">
								Your progress will be saved and tracked individually · Build 2026-01-11
							</p>
						</>
					) : (
						<>
							<div className="space-y-2">
								<Label htmlFor="admin-password">Admin Password</Label>
								<Input
									id="admin-password"
									type="password"
									value={adminPassword}
									onChange={(e) => setAdminPassword(e.target.value)}
									placeholder="Enter admin password"
									disabled={isLoading}
									className="login-input"
									onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
								/>
							</div>

							{error && (
								<Alert variant="destructive">
									<XCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<Button onClick={handleAdminLogin} disabled={isLoading} className="w-full login-primary" size="lg">
								{isLoading ? "Loading..." : "Login as Admin"}
							</Button>

							<Button
								onClick={() => {
									setShowAdminLogin(false);
									setError(null);
									setAdminPassword("");
								}}
								variant="ghost"
								className="w-full"
							>
								Back to User Login
							</Button>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}








