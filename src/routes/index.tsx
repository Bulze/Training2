import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
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
import { VideosORM, type VideosModel } from "@/sdk/database/orm/orm_videos";
import { QuestionsORM, type QuestionsModel } from "@/sdk/database/orm/orm_questions";
import { TrainingSessionsORM, type TrainingSessionsModel } from "@/sdk/database/orm/orm_training_sessions";
import { UserProgressORM, type UserProgressModel } from "@/sdk/database/orm/orm_user_progress";
import { QuizAttemptsORM, type QuizAttemptsModel } from "@/sdk/database/orm/orm_quiz_attempts";
import { CompletionsORM, type CompletionsModel } from "@/sdk/database/orm/orm_completions";
import { UsersORM, type UsersModel } from "@/sdk/database/orm/orm_users";
import { Play, Pause, CheckCircle2, XCircle, Trophy, Settings, Users, Trash2, LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateData, CreateValue, DataStoreClient, ParseValue } from "@/sdk/database/orm/client";
import { DataType, SimpleSelector, type Value } from "@/sdk/database/orm/common";
import Player from "@vimeo/player";

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

type PayrollEmployee = {
	employee: string;
	sales: number;
	bonus: number;
	tips: number;
	ppv_sales?: number;
	dm_sales?: number;
	clocked_hours?: number;
	scheduled_hours?: number;
	messages_per_hour?: number;
	fans_per_hour?: number;
	response_clock_avg?: number;
	insights?: string[];
};

type PayrollSnapshot = {
	min_date: string;
	max_date: string;
	employees: PayrollEmployee[];
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
			.filter(Boolean);

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

	const similarity = overlap / Math.max(idealTokens.size, 1);
	const isCorrect = similarity >= 0.5;

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
	const apiBase = import.meta.env.VITE_API_BASE_PATH || "";
	if (!apiBase) return null;

	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), 20000);

	try {
		const response = await fetch(`${apiBase}/ai/evaluate`, {
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

	// Check for logged in user on mount
	useEffect(() => {
		const userId = sessionStorage.getItem("current_user_id");
		if (userId) {
			const usersOrm = UsersORM.getInstance();
			usersOrm.getUsersByIDs([userId]).then((users) => {
				if (users.length > 0) {
					setCurrentUser(users[0]);
				} else {
					sessionStorage.removeItem("current_user_id");
				}
			});
		}
	}, []);

	const handleLogin = (user: UsersModel) => {
		setCurrentUser(user);
		sessionStorage.setItem("current_user_id", user.id);
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
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,_#111b34_0%,_#0a0f1f_55%)]">
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
		</div>
	);
}

function AdminPanel() {
	const [activeTab, setActiveTab] = useState<"management" | "training">("management");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "management" | "training")}>
			<TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-900 border border-slate-800">
				<TabsTrigger value="management" className="gap-2">
					<Users className="w-4 h-4" />
					Management
				</TabsTrigger>
				<TabsTrigger value="training" className="gap-2">
					<Settings className="w-4 h-4" />
					Training
				</TabsTrigger>
			</TabsList>

			<TabsContent value="management">
				<ManagementPanel />
			</TabsContent>

			<TabsContent value="training">
				<TrainingPanel />
			</TabsContent>
		</Tabs>
	);
}

function ManagementPanel() {
	const [activeTab, setActiveTab] = useState<"users" | "payroll">("users");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "users" | "payroll")}>
			<TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-900 border border-slate-800">
				<TabsTrigger value="users">User Approvals</TabsTrigger>
				<TabsTrigger value="payroll">Payroll</TabsTrigger>
			</TabsList>

			<TabsContent value="users">
				<UserApprovalsPanel />
			</TabsContent>

			<TabsContent value="payroll">
				<PayrollPanel />
			</TabsContent>
		</Tabs>
	);
}

function TrainingPanel() {
	const [activeTab, setActiveTab] = useState<"create" | "manage" | "roles" | "submissions">("create");

	return (
		<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "manage" | "roles" | "submissions")}>
			<TabsList className="grid w-full grid-cols-4 mb-6 bg-slate-900 border border-slate-800">
				<TabsTrigger value="create">Create Training</TabsTrigger>
				<TabsTrigger value="manage">Manage Tests</TabsTrigger>
				<TabsTrigger value="roles">Roles & Inflow</TabsTrigger>
				<TabsTrigger value="submissions">Submissions</TabsTrigger>
			</TabsList>

			<TabsContent value="create">
				<CreateTrainingPanel />
			</TabsContent>

			<TabsContent value="manage">
				<ManageTestsPanel />
			</TabsContent>

			<TabsContent value="roles">
				<TrainingRolesPanel />
			</TabsContent>

			<TabsContent value="submissions">
				<AllSubmissionsPanel />
			</TabsContent>
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
			<Card className="bg-slate-900 border-slate-800">
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

			<Card className="bg-slate-900 border-slate-800">
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
			<Card className="bg-slate-900 border-slate-800">
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
		<Card className="bg-slate-900 border-slate-800">
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

	const pending = users.filter((user) => !user.is_admin && !user.is_approved);
	const approved = users.filter((user) => !user.is_admin && user.is_approved);

	return (
		<div className="space-y-6">
			<Card className="bg-slate-900 border-slate-800">
				<CardHeader>
					<CardTitle className="text-slate-100">Pending Approvals ({pending.length})</CardTitle>
					<CardDescription className="text-slate-400">Approve or reject new users</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{pending.map((user) => (
						<div key={user.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-slate-800 bg-slate-800/40">
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
									onClick={() => updateUser.mutate({ ...user, is_approved: false })}
									disabled={updateUser.isPending}
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

			<Card className="bg-slate-900 border-slate-800">
				<CardHeader>
					<CardTitle className="text-slate-100">Approved Users ({approved.length})</CardTitle>
					<CardDescription className="text-slate-400">Manage approved access</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{approved.map((user) => (
						<div key={user.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-slate-800 bg-slate-800/40">
							<div>
								<p className="text-slate-100 font-medium">{user.name}</p>
								<p className="text-sm text-slate-400">{user.email}</p>
								<p className="text-xs text-slate-500">
									Role: {user.role || DEFAULT_ROLE} · Inflow: {user.inflow_username || "—"}
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
					{approved.length === 0 && (
						<p className="text-center text-slate-500 py-6">No approved users yet</p>
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
	const [aiEnabled, setAiEnabled] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [snapshot, setSnapshot] = useState<PayrollSnapshot | null>(null);

	useEffect(() => {
		const raw = localStorage.getItem("payroll_snapshot");
		if (raw) {
			try {
				setSnapshot(JSON.parse(raw) as PayrollSnapshot);
			} catch {
				setSnapshot(null);
			}
		}
	}, []);

	const handleAnalyze = async () => {
		if (!salesFile) {
			setStatus("Please select a payroll Excel file.");
			return;
		}

		const formData = new FormData();
		formData.append("file", salesFile);
		if (chatFile) {
			formData.append("chat_file", chatFile);
		}
		if (dateFrom) formData.append("date_from", dateFrom);
		if (dateTo) formData.append("date_to", dateTo);
		formData.append("ai_enabled", aiEnabled ? "true" : "false");

		setStatus("Analyzing payroll...");

		try {
			const response = await fetch(`${PAYROLL_API_BASE}/api/analyze`, {
				method: "POST",
				body: formData,
			});
			const data = (await response.json()) as PayrollSnapshot & { error?: string };
			if (!response.ok) {
				setStatus(data.error || "Payroll analysis failed.");
				return;
			}
			localStorage.setItem("payroll_snapshot", JSON.stringify(data));
			localStorage.setItem("payroll_snapshot_updated", new Date().toLocaleString());
			setSnapshot(data);
			setStatus(`Payroll loaded for ${data.employees.length} employees.`);
		} catch (error) {
			setStatus(`Payroll request failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	};

	const clearSnapshot = () => {
		localStorage.removeItem("payroll_snapshot");
		localStorage.removeItem("payroll_snapshot_updated");
		setSnapshot(null);
		setStatus("Stored payroll cleared.");
	};

	return (
		<Card className="bg-slate-900 border-slate-800">
			<CardHeader>
				<CardTitle className="text-slate-100">Payroll Upload</CardTitle>
				<CardDescription className="text-slate-400">
					Load payroll from the Payroll app API and share results with chatter dashboards
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label>Sales Excel</Label>
						<Input
							type="file"
							accept=".xlsx,.xlsm,.xltx,.xltm"
							onChange={(e) => setSalesFile(e.target.files?.[0] || null)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Chats Excel (optional)</Label>
						<Input
							type="file"
							accept=".xlsx,.xlsm,.xltx,.xltm"
							onChange={(e) => setChatFile(e.target.files?.[0] || null)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Date From</Label>
						<Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label>Date To</Label>
						<Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
					</div>
				</div>

				<div className="flex items-center gap-4">
					<Label className="text-slate-300">AI Insights</Label>
					<Button
						variant={aiEnabled ? "default" : "outline"}
						size="sm"
						onClick={() => setAiEnabled((prev) => !prev)}
					>
						{aiEnabled ? "Enabled" : "Disabled"}
					</Button>
				</div>

				<div className="flex flex-col md:flex-row gap-3">
					<Button onClick={handleAnalyze} className="bg-emerald-600 hover:bg-emerald-700">
						Load Payroll
					</Button>
					<Button variant="outline" onClick={clearSnapshot}>
						Clear Stored Payroll
					</Button>
				</div>

				{status && (
					<Alert className="bg-slate-800 border-slate-700">
						<AlertDescription className="text-slate-200">{status}</AlertDescription>
					</Alert>
				)}

				{snapshot && (
					<div className="text-sm text-slate-400">
						Loaded range: {snapshot.min_date} → {snapshot.max_date} · Employees: {snapshot.employees.length}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function TrainingRolesPanel() {
	const usersOrm = UsersORM.getInstance();
	const queryClient = useQueryClient();
	const [edits, setEdits] = useState<Record<string, Partial<UsersModel>>>({});

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

	const updateEdit = (userId: string, patch: Partial<UsersModel>) => {
		setEdits((prev) => ({
			...prev,
			[userId]: { ...prev[userId], ...patch },
		}));
	};

	const trainingUsers = users.filter((user) => !user.is_admin);

	return (
		<Card className="bg-slate-900 border-slate-800">
			<CardHeader>
				<CardTitle className="text-slate-100">Roles & Inflow Mapping</CardTitle>
				<CardDescription className="text-slate-400">
					Assign roles and inflow usernames for payroll dashboards
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{trainingUsers.map((user) => {
					const draft = edits[user.id] || {};
					const role = (draft.role ?? user.role ?? DEFAULT_ROLE) as string;
					const inflow = (draft.inflow_username ?? user.inflow_username ?? "") as string;
					return (
						<div key={user.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-4 border border-slate-800 rounded-lg bg-slate-800/40">
							<div>
								<p className="text-slate-100 font-medium">{user.name}</p>
								<p className="text-xs text-slate-400">{user.email}</p>
							</div>
							<div className="space-y-2">
								<Label>Role</Label>
								<select
									className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
									value={role}
									onChange={(e) => updateEdit(user.id, { role: e.target.value })}
								>
									<option value="recruit">Recruit</option>
									<option value="chatter">Chatter</option>
								</select>
							</div>
							<div className="space-y-2">
								<Label>Inflow Username</Label>
								<Input
									value={inflow}
									onChange={(e) => updateEdit(user.id, { inflow_username: e.target.value })}
									placeholder="inflow username"
								/>
							</div>
							<div className="flex justify-end">
								<Button
									onClick={() => updateUser.mutate({ ...user, ...draft })}
									disabled={updateUser.isPending}
								>
									Save
								</Button>
							</div>
						</div>
					);
				})}

				{trainingUsers.length === 0 && (
					<p className="text-center text-slate-500 py-6">No users available</p>
				)}
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

	return (
		<Card className="bg-slate-900 border-slate-800">
			<CardHeader>
				<CardTitle className="text-slate-100">All User Submissions ({allCompletions.length})</CardTitle>
				<CardDescription className="text-slate-400">View all quiz completions and answers from all users</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-6">
					{allCompletions
						.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
						.map((completion) => {
							const user = allUsers.find((u) => u.id === completion.user_id);
							const video = allVideos.find((v) => v.id === completion.video_id);
							const session = allSessions.find((s) => s.video_id === completion.video_id);
							const userAttempts = allAttempts.filter(
								(a) => a.user_id === completion.user_id && a.video_id === completion.video_id
							);

							const passed = session ? completion.score >= session.pass_threshold : false;

							return (
								<Card key={completion.id} className="bg-slate-800 border-slate-700">
									<CardHeader>
										<div className="flex justify-between items-start">
											<div>
												<CardTitle className="text-lg">
													{user?.name || "Unknown User"} - {video?.title || "Unknown Video"}
												</CardTitle>
												<CardDescription>
													Score: {completion.score}/{session?.total_questions || "?"} |{" "}
													{passed ? (
														<span className="text-green-600 font-medium">PASSED</span>
													) : (
														<span className="text-red-600 font-medium">FAILED</span>
													)}
												</CardDescription>
											</div>
											<Badge variant={passed ? "default" : "destructive"}>
												{passed ? "Passed" : "Failed"}
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										<div className="space-y-4">
											<div className="text-sm text-slate-600">
												<p>
													<strong>Submitted:</strong> {new Date(completion.completed_at).toLocaleString()}
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
														<div key={attempt.id} className="p-3 bg-slate-50 rounded-lg">
															<div className="flex justify-between items-start mb-2">
																<p className="text-sm font-medium text-slate-700">Answer {idx + 1}</p>
																<Badge variant={attempt.is_correct ? "default" : "secondary"}>
																	{attempt.is_correct ? "Correct" : "Incorrect"}
																</Badge>
															</div>
															<p className="text-sm text-slate-600 mb-1">
																<strong>Answer:</strong> {attempt.user_answer}
															</p>
															{attempt.ai_feedback && (
																<p className="text-xs text-slate-500 italic">
																	<strong>AI Feedback:</strong> {attempt.ai_feedback}
																</p>
															)}
														</div>
													))
												) : (
													<p className="text-sm text-slate-500">No individual answers recorded</p>
												)}
											</div>
										</div>
									</CardContent>
								</Card>
							);
						})}
					{allCompletions.length === 0 && <p className="text-center text-slate-500 py-8">No submissions yet</p>}
				</div>
			</CardContent>
		</Card>
	);
}

function UserView({ user }: { user: UsersModel }) {
	const userId = user.id;
	const [selectedVideo, setSelectedVideo] = useState<VideosModel | null>(null);
	const [showQuiz, setShowQuiz] = useState(false);
	const [completionResult, setCompletionResult] = useState<CompletionsModel | null>(null);

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

	const handleQuizComplete = (result: CompletionsModel) => {
		setCompletionResult(result);
	};

	if (completionResult) {
		return <CompletionScreen completion={completionResult} onReset={() => {
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
			<Card className="bg-slate-900 border-slate-800">
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
									className="bg-slate-800 border-slate-700 cursor-pointer hover:shadow-lg hover:shadow-slate-700/50 transition-shadow"
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
													<span className="font-semibold">{completion.score}/10</span>
												</div>
												<div className="flex justify-between text-sm mt-1">
													<span>Code:</span>
													<span className="font-mono font-bold">{completion.completion_code}</span>
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

	const loadSnapshot = () => {
		const raw = localStorage.getItem("payroll_snapshot");
		const updatedAt = localStorage.getItem("payroll_snapshot_updated");
		setLastUpdated(updatedAt);
		if (!raw) {
			setSnapshot(null);
			return;
		}
		try {
			setSnapshot(JSON.parse(raw) as PayrollSnapshot);
		} catch {
			setSnapshot(null);
		}
	};

	useEffect(() => {
		loadSnapshot();
	}, []);

	const inflow = user.inflow_username?.trim();
	const employee = inflow && snapshot
		? snapshot.employees.find((emp) => emp.employee.toLowerCase() === inflow.toLowerCase())
		: null;

	return (
		<Card className="bg-slate-900 border-slate-800">
			<CardHeader>
				<div className="flex justify-between items-start">
					<div>
						<CardTitle className="text-slate-100">Chatter Dashboard</CardTitle>
						<CardDescription className="text-slate-400">
							Your payroll stats from the latest admin upload
						</CardDescription>
					</div>
					<Button variant="outline" size="sm" onClick={loadSnapshot}>
						Refresh
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
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

				{employee && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Card className="bg-slate-800 border-slate-700">
							<CardHeader>
								<CardTitle className="text-sm text-slate-200">Sales</CardTitle>
							</CardHeader>
							<CardContent className="text-2xl font-semibold text-emerald-400">
								${employee.sales.toFixed(2)}
							</CardContent>
						</Card>
						<Card className="bg-slate-800 border-slate-700">
							<CardHeader>
								<CardTitle className="text-sm text-slate-200">Bonus</CardTitle>
							</CardHeader>
							<CardContent className="text-2xl font-semibold text-sky-400">
								${employee.bonus.toFixed(2)}
							</CardContent>
						</Card>
						<Card className="bg-slate-800 border-slate-700">
							<CardHeader>
								<CardTitle className="text-sm text-slate-200">Tips</CardTitle>
							</CardHeader>
							<CardContent className="text-2xl font-semibold text-pink-400">
								${employee.tips.toFixed(2)}
							</CardContent>
						</Card>
						<Card className="bg-slate-800 border-slate-700">
							<CardHeader>
								<CardTitle className="text-sm text-slate-200">Clocked Hours</CardTitle>
							</CardHeader>
							<CardContent className="text-2xl font-semibold text-slate-200">
								{employee.clocked_hours?.toFixed(1) ?? "—"}
							</CardContent>
						</Card>
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

				{lastUpdated && (
					<p className="text-xs text-slate-500">Last updated: {lastUpdated}</p>
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
}: {
	video: VideosModel;
	userId: string;
	onComplete: () => void;
	onBack: () => void;
}) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [maxWatchedTime, setMaxWatchedTime] = useState(0);
	const [hasWatchedFull, setHasWatchedFull] = useState(false);
	const [skipBlocked, setSkipBlocked] = useState(false);
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
		}
	}, [existingProgress]);

	// Reset video when component mounts or video changes
	useEffect(() => {
		setIsPlaying(false);
		setVimeoDuration(0);
		setVimeoError(null);
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
			<Card className="bg-slate-900 border-slate-800">
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
					</div>

					{skipBlocked && (
						<Alert className="bg-amber-50 border-amber-200">
							<AlertDescription className="text-amber-800">
								Skipping is disabled. Please continue from the last watched point.
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
										Watch at least 95% of the video to unlock the quiz. Current progress:{" "}
										{ytDuration ? Math.floor((maxWatchedTime / ytDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-50 border-green-200">
									<CheckCircle2 className="h-4 w-4 text-green-600" />
									<AlertDescription className="text-green-800">
										Video completed! You can now proceed to the quiz.
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
										Watch at least 95% of the video to unlock the quiz. Current progress:{" "}
										{Math.floor((maxWatchedTime / video.duration) * 100)}%
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-900/50 border-green-700">
									<CheckCircle2 className="h-4 w-4 text-green-400" />
									<AlertDescription className="text-green-200">
										Video completed! You can now proceed to the quiz.
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
										Watch at least 95% of the video to unlock the quiz. Current progress:{" "}
										{vimeoDuration ? Math.floor((maxWatchedTime / vimeoDuration) * 100) : video.duration ? Math.floor((maxWatchedTime / video.duration) * 100) : 0}%
									</AlertDescription>
								</Alert>
							)}

							{hasWatchedFull && (
								<Alert className="bg-green-900/50 border-green-700">
									<CheckCircle2 className="h-4 w-4 text-green-400" />
									<AlertDescription className="text-green-200">
										Video completed! You can now proceed to the quiz.
									</AlertDescription>
								</Alert>
							)}
						</div>
					)}

					<Button
						onClick={onComplete}
						disabled={!hasWatchedFull}
						className="w-full"
						size="lg"
					>
						{hasWatchedFull ? "Start Quiz" : "Watch full video to unlock quiz"}
					</Button>
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
	onComplete: (completion: CompletionsModel) => void;
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

			const score = results.filter((r) => r.isCorrect).length;
			const passed = score >= session.pass_threshold;

			if (passed) {
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
				onComplete(completion);
			} else {
				setError(`You scored ${score}/${sortedQuestions.length}. You need ${session.pass_threshold} correct answers to pass. Please try again.`);
			}
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
		<div className="max-w-3xl mx-auto space-y-6">
			<Card className="bg-slate-900 border-slate-800">
				<CardHeader>
					<div className="flex justify-between items-center">
						<div>
							<CardTitle className="text-slate-100">Quiz Assessment</CardTitle>
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
							<div className="p-4 bg-slate-50 rounded-lg">
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
							>
								{completedQuestions.has(currentQuestionIndex) ? "Next Question" : "Save & Next"}
							</Button>
						) : (
							<Button
								onClick={submitQuiz}
								disabled={!allQuestionsCompleted || evaluating}
								className="bg-green-600 hover:bg-green-700"
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

function CompletionScreen({ completion, onReset }: { completion: CompletionsModel; onReset: () => void }) {
	return (
		<div className="max-w-2xl mx-auto">
			<Card className="border-green-800 bg-green-950/30">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center">
							<Trophy className="w-12 h-12 text-white" />
						</div>
					</div>
					<CardTitle className="text-3xl text-green-400">Congratulations!</CardTitle>
					<CardDescription className="text-green-300 text-lg">
						You have successfully completed the training
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="bg-slate-800 rounded-lg p-6 space-y-4">
						<div className="flex justify-between items-center text-lg">
							<span className="text-slate-600">Your Score:</span>
							<span className="font-bold text-2xl text-green-600">{completion.score}/10</span>
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
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,_#111b34_0%,_#0a0f1f_55%)] flex items-center justify-center px-4">
			<Card className="w-full max-w-lg bg-slate-900 border-slate-800">
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
		<div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4">
			<Card className="w-full max-w-md bg-slate-900 border-slate-800">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className={cn(
							"w-16 h-16 rounded-full flex items-center justify-center",
							showAdminLogin ? "bg-red-600" : "bg-blue-600"
						)}>
							<UserCircle className="w-10 h-10 text-white" />
						</div>
					</div>
					<CardTitle className="text-2xl text-slate-100">
						{showAdminLogin ? "Admin Login" : "Welcome to Training Platform"}
					</CardTitle>
					<CardDescription className="text-slate-400">
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
									onKeyDown={(e) => e.key === "Enter" && handleLogin()}
								/>
							</div>

							{error && (
								<Alert variant="destructive">
									<XCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<Button onClick={handleLogin} disabled={isLoading} className="w-full" size="lg">
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
								className="w-full"
							>
								<Settings className="w-4 h-4 mr-2" />
								Admin Login
							</Button>

							<p className="text-sm text-slate-500 text-center">
								Your progress will be saved and tracked individually
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
									onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
								/>
							</div>

							{error && (
								<Alert variant="destructive">
									<XCircle className="h-4 w-4" />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<Button onClick={handleAdminLogin} disabled={isLoading} className="w-full" size="lg">
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
