import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Shapes, Search, Clapperboard, Coins, BadgeCent, Radio, Award, Video,
  TrendingUp, Sparkles, ShieldAlert, ShieldCheck, Building2, Droplets,
  Footprints, HeartPulse, Eye, Network, HeartHandshake, Waves,
  Database, Shield, Lock, Key, UserRound, Hash, ScanFace, Bot, Lightbulb,
  MessageSquareText, Gavel, SearchCheck, Ghost, Mic, Podcast, Store, Brain,
  Scale, SlidersHorizontal, ScrollText, Timer, TimerReset, LockKeyhole,
  SunMedium, Accessibility, Wind, History, Users, BookOpen, Flame, Trophy,
  Star, TimerOff, Send, HandCoins, KeyRound, Repeat, Radar, ShoppingCart,
  Gift, MapPin, PiggyBank, Sprout, Layers, BarChart3, Wheat, Stethoscope,
  CloudRain, Tractor, Leaf, TreePine, Recycle, Briefcase, FileText, Terminal,
  Landmark, GraduationCap, ClipboardList, PenTool, FileSignature, Vote, LandPlot,
  AlertTriangle, BookUser, Heart, BellOff, Bell, Calculator, CalendarHeart,
  Plane, Gem, Luggage, CarFront, Bike, CarTaxiFront, ParkingSquare, Camera,
  Share2, Fingerprint, Usb, Satellite, Atom, BrainCircuit, Stamp, Swords,
  UserCog, Smile, BookMarked, Repeat2, BadgeCheck, UtensilsCrossed,
  Receipt, CalendarX, CloudOff, EyeOff, Blocks, MessagesSquare, Wallet, Wand2, FlaskConical,
} from 'lucide-react';
import CallWhiteboard from './call/CallWhiteboard';
import VisualSearch from './VisualSearch';
import CollaborativeReels from './CollaborativeReels';
import RevenueShare from './RevenueShare';
import MicroSubscriptions from './MicroSubscriptions';
import CoStreaming from './CoStreaming';
import ReelBounties from './ReelBounties';
import FacelessVideoGenerator from './FacelessVideoGenerator';
import TrendingSounds from './TrendingSounds';
import SmartCommunity from './SmartCommunity';
import SafeSOSView from './SafeSOSView';
import SafetyShieldView from './SafetyShieldView';
import SafeShelterView from './SafeShelterView';
import BloodDonorRegistry from './BloodDonorRegistry';
import MissingPersonView from './MissingPersonView';
import SafeEscortView from './SafeEscortView';
import SOSAlertView from './SOSAlertView';
import SafeWatchView from './SafeWatchView';
import OfflineChatView from './OfflineChatView';
import SafeHavenView from './SafeHavenView';
import FloodDepthMapperView from './FloodDepthMapperView';
import DataSovereigntyView from './DataSovereigntyView';
import E2EEMessenger from './E2EEMessenger';
import PrivacyDashboard from './PrivacyDashboard';
import AnonymousMode from './AnonymousMode';
import DecentralizedProfiles from './DecentralizedProfiles';
import SecureVaultView from './SecureVaultView';
import HumanityScore from './HumanityScore';
import BotBounty from './BotBounty';
import TriggerWarnings from './TriggerWarnings';
import FeedExplainer from './FeedExplainer';
import ProfileSummary from './ProfileSummary';
import CommentSummary from './CommentSummary';
import AIModerator from './AIModerator';
import FactChecker from './FactChecker';
import GhostMode from './GhostMode';
import LocalTranscriber from './LocalTranscriber';
import DailyPodcast from './DailyPodcast';
import MarketNegotiator from './MarketNegotiator';
import DigitalTwin from './DigitalTwin';
import DebateModerator from './DebateModerator';
import AlgoPanel from './AlgoPanel';
import AuditLog from './AuditLog';
import ZeroDoomscroll from './ZeroDoomscroll';
import IntentionalScroll from './IntentionalScroll';
import FocusLock from './FocusLock';
import UpliftFeed from './UpliftFeed';
import SensorySafeMode from './SensorySafeMode';
import TakeABreath from './TakeABreath';
import MemoryRecaps from './MemoryRecaps';
import CollabPosts from './CollabPosts';
import StoryChains from './StoryChains';
import Streaks from './Streaks';
import Achievements from './Achievements';
import Reputation from './Reputation';
import SilentDrop from './SilentDrop';
import StealthRec from './StealthRec';
import Escrow from './Escrow';
import P2PRenting from './P2PRenting';
import BarterExchange from './BarterExchange';
import GigRadar from './GigRadar';
import GroupBuy from './GroupBuy';
import BuyNothing from './BuyNothing';
import GarageSaleMap from './GarageSaleMap';
import ChitFund from './ChitFund';
import SavingCircle from './SavingCircle';
import SubscriptionManager from './SubscriptionManager';
import DataMarketplace from './DataMarketplace';
import MandiPrices from './MandiPrices';
import FarmLive from './FarmLive';
import CropDiagnosis from './CropDiagnosis';
import IrrigationScheduler from './IrrigationScheduler';
import FarmToolPool from './FarmToolPool';
import CarbonLedger from './CarbonLedger';
import Afforestation from './Afforestation';
import PlasticWealth from './PlasticWealth';
import InterviewRoom from './InterviewRoom';
import Portfolio from './Portfolio';
import ResumeBuilder from './ResumeBuilder';
import PairCoding from './PairCoding';
import InternshipBoard from './InternshipBoard';
import JobAlerts from './JobAlerts';
import TutorMatch from './TutorMatch';
import AssignmentHelp from './AssignmentHelp';
import ExamWarRoom from './ExamWarRoom';
import ScholarshipTracker from './ScholarshipTracker';
import FamilyCircle from './FamilyCircle';
import ContentGate from './ContentGate';
import ElderMode from './ElderMode';
import GuardianApproval from './GuardianApproval';
import PeriodTracker from './PeriodTracker';
import EvidenceVault from './EvidenceVault';
import LawyerMatch from './LawyerMatch';
import LegalAid from './LegalAid';
import ContractBuilder from './ContractBuilder';
import RTIFiler from './RTIFiler';
import DigitalFIR from './DigitalFIR';
import WardCivic from './WardCivic';
import CivicEscalation from './CivicEscalation';
import TenderTracker from './TenderTracker';
import LandTrust from './LandTrust';
import BioDataBuilder from './BioDataBuilder';
import ChaperoneMode from './ChaperoneMode';
import CompatibilityMatrix from './CompatibilityMatrix';
import HalalTimeline from './HalalTimeline';
import CommunityMatchmaker from './CommunityMatchmaker';
import AzanAutoMute from './AzanAutoMute';
import ZakatCalculator from './ZakatCalculator';
import VenueStatus from './VenueStatus';
import QuranCircle from './QuranCircle';
import ReligiousEvents from './ReligiousEvents';
import TravelBuddy from './TravelBuddy';
import HiddenGems from './HiddenGems';
import GroupTrip from './GroupTrip';
import Carpool from './Carpool';
import CNGFare from './CNGFare';
import ParkingShare from './ParkingShare';
import TrafficWitness from './TrafficWitness';
import FediverseBridge from './FediverseBridge';
import ZKKYC from './ZKKYC';
import HardwareWallet from './HardwareWallet';
import SatelliteFallback from './SatelliteFallback';
import QuantumCrypto from './QuantumCrypto';
import FederatedLearning from './FederatedLearning';
import WatermarkStudio from './WatermarkStudio';
import RedTeamArena from './RedTeamArena';
import Personas from './Personas';
import MoodFeed from './MoodFeed';
import DeepDive from './DeepDive';
import SkillExchange from './SkillExchange';
import AlumniNetwork from './AlumniNetwork';
import VerifiedLive from './VerifiedLive';
import SafetyShorts from './SafetyShorts';
import EvacuationRoutes from './EvacuationRoutes';
import CommunityKitchens from './CommunityKitchens';
import RelationshipTimeline from './RelationshipTimeline';
import SplitBillView from './SplitBillView';
import VoiceSummary from './VoiceSummary';
import StudyRooms from './StudyRooms';
import EventGroups from './EventGroups';
import Marketplace from './Marketplace';
import OceanPay from './OceanPay';
import DigitalLegacy from './DigitalLegacy';
import OfflineDrafts from './OfflineDrafts';
import MissingFaceSearch from './MissingFaceSearch';
import ProximityAlert from './ProximityAlert';
import Stories2 from './Stories2';
import OceanCutVideo from './OceanCutVideo';
import OceanCutPhoto from './OceanCutPhoto';
import LiveEcosystem from './LiveEcosystem';
import MiniAppStore from './MiniAppStore';
import CommunitiesPro from './CommunitiesPro';
import CreatorMonetization from './CreatorMonetization';
import ProGraph from './ProGraph';
import CreationLab from './CreationLab';
import SnapMap from './SnapMap';
import OSLayer from './OSLayer';
import DataBrain from './DataBrain';

/**
 * Ocean — New Features Hub (features 109+)
 * -----------------------------------------
 * Single entry point wired into App.tsx's Feature Hub ("New features" card). Every
 * backend batch adds its feature launchers here, so App.tsx never grows per feature.
 * Clicking a card replaces this hub with that feature's full-screen overlay; the
 * feature's own onClose returns here.
 */
interface NewFeaturesHubProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type ActiveFeature =
  | null
  | 'whiteboard'
  | 'visualsearch'
  | 'collabreels'
  | 'revenue'
  | 'subscriptions'
  | 'costream'
  | 'bounties'
  | 'faceless'
  | 'trendingsounds'
  | 'smartcommunity'
  | 'safesos'
  | 'safetyshield'
  | 'safeshelter'
  | 'blooddonor'
  | 'missingperson'
  | 'safeescort'
  | 'sosalert'
  | 'safewatch'
  | 'offlinemesh'
  | 'safehaven'
  | 'flooddepth'
  | 'datasovereignty'
  | 'e2ee'
  | 'privacydashboard'
  | 'anonymous'
  | 'securevault'
  | 'did'
  | 'humanity'
  | 'botbounty'
  | 'triggerwarnings'
  | 'feedexplain'
  | 'profilesummary'
  | 'commentsummary'
  | 'aimoderator'
  | 'factchecker'
  | 'ghostmode'
  | 'localtranscriber'
  | 'dailyPodcast'
  | 'marketNegotiator'
  | 'digitalTwin'
  | 'debateModerator'
  | 'algoPanel'
  | 'auditLog'
  | 'zeroDoomscroll'
  | 'intentionalScroll'
  | 'focusLock'
  | 'upliftFeed'
  | 'sensorySafe'
  | 'takeABreath'
  | 'memoryRecaps'
  | 'collabPosts'
  | 'storyChains'
  | 'streaks'
  | 'achievements'
  | 'reputation'
  | 'silentDrop'
  | 'stealthRec'
  | 'escrow'
  | 'p2pRenting'
  | 'barter'
  | 'gigRadar'
  | 'groupBuy'
  | 'buyNothing'
  | 'garageSale'
  | 'chitFund'
  | 'savingCircle'
  | 'subscriptionManager'
  | 'dataMarketplace'
  | 'mandiPrices'
  | 'farmLive'
  | 'cropDiagnosis'
  | 'irrigation'
  | 'farmToolPool'
  | 'carbonLedger'
  | 'afforestation'
  | 'plasticWealth'
  | 'interview'
  | 'portfolio'
  | 'resume'
  | 'paircoding'
  | 'internships'
  | 'jobalerts'
  | 'tutor'
  | 'assignmenthelp'
  | 'examroom'
  | 'scholarships'
  | 'familycircle'
  | 'contentgate'
  | 'eldermode'
  | 'guardian'
  | 'periodtracker'
  | 'evidencevault'
  | 'lawyermatch'
  | 'legalaid'
  | 'contracts'
  | 'rtifiler'
  | 'digitalfir'
  | 'wardbudget'
  | 'wardsabha'
  | 'civicescalation'
  | 'tenders'
  | 'landtrust'
  | 'biodata'
  | 'chaperone'
  | 'compatibility'
  | 'halaltimeline'
  | 'matchmaker'
  | 'azan'
  | 'zakat'
  | 'venues'
  | 'qurancircle'
  | 'religousevents'
  | 'travelbuddy'
  | 'hiddengems'
  | 'grouptrip'
  | 'carpool'
  | 'bikepool'
  | 'cngfare'
  | 'parking'
  | 'trafficwitness'
  | 'fediverse'
  | 'zkkyc'
  | 'hardwarewallet'
  | 'satellite'
  | 'quantumcrypto'
  | 'federatedlearning'
  | 'watermark'
  | 'redteam'
  | 'personas'
  | 'moodfeed'
  | 'deepdive'
  | 'skillexchange'
  | 'alumni'
  | 'verifiedlive'
  | 'safetyshorts'
  | 'evacuation'
  | 'kitchens'
  | 'relationtimeline'
  | 'splitbill'
  | 'voicesummary'
  | 'studyrooms'
  | 'eventgroups'
  | 'marketplace'
  | 'oceanpay'
  | 'digitallegacy'
  | 'offlinedrafts'
  | 'missingface'
  | 'proximityalert'
  | 'stories2'
  | 'oceancutvideo'
  | 'oceancutphoto'
  | 'liveecosystem'
  | 'miniapps'
  | 'communitiespro'
  | 'creatormonetization'
  | 'prograph'
  | 'creationlab'
  | 'snapmap'
  | 'oslayer'
  | 'databrain';

interface FeatureDef {
  id: ActiveFeature;
  title: string;
  desc: string;
  icon: ReactNode;
  badge: string;
}

export default function NewFeaturesHub({ token, currentUser, onClose }: NewFeaturesHubProps) {
  const [active, setActive] = useState<ActiveFeature>(null);

  const features: FeatureDef[] = [
    { id: 'whiteboard', title: 'Whiteboard', desc: 'Shared canvas for video calls', icon: <Shapes size={16} className="text-amber-800 dark:text-amber-400" />, badge: '109' },
    { id: 'visualsearch', title: 'Visual Search', desc: 'Describe media to find it', icon: <Search size={16} className="text-amber-800 dark:text-amber-400" />, badge: '110' },
    { id: 'collabreels', title: 'Collaborative Reels', desc: 'Co-create a reel with friends', icon: <Clapperboard size={16} className="text-amber-800 dark:text-amber-400" />, badge: '111' },
    { id: 'revenue', title: 'Revenue Share', desc: 'Ad revenue split to admins', icon: <Coins size={16} className="text-amber-800 dark:text-amber-400" />, badge: '112' },
    { id: 'subscriptions', title: 'Micro-Subscriptions', desc: '10-Taka patron monthly', icon: <BadgeCent size={16} className="text-amber-800 dark:text-amber-400" />, badge: '113' },
    { id: 'costream', title: 'Co-Streaming', desc: 'Co-host live + tip split', icon: <Radio size={16} className="text-amber-800 dark:text-amber-400" />, badge: '114' },
    { id: 'bounties', title: 'Reel Bounties', desc: 'Coins for solved bugs', icon: <Award size={16} className="text-amber-800 dark:text-amber-400" />, badge: '115' },
    { id: 'faceless', title: 'Faceless Video', desc: 'Topic → AI video plan', icon: <Video size={16} className="text-amber-800 dark:text-amber-400" />, badge: '116' },
    { id: 'trendingsounds', title: 'Trending Sounds', desc: 'Predict next viral audio', icon: <TrendingUp size={16} className="text-amber-800 dark:text-amber-400" />, badge: '117' },
    { id: 'smartcommunity', title: 'Smart Community', desc: 'AI community moderation + summaries', icon: <Sparkles size={16} className="text-amber-800 dark:text-amber-400" />, badge: '118' },
    { id: 'safesos', title: 'Safe SOS', desc: 'Safety circle: contacts + SOS + safe walk', icon: <ShieldAlert size={16} className="text-rose-700 dark:text-rose-400" />, badge: '119' },
    { id: 'safetyshield', title: 'Safety Shield', desc: 'Trusted circle + check-in SOS', icon: <ShieldCheck size={16} className="text-rose-700 dark:text-rose-400" />, badge: '120' },
    { id: 'safeshelter', title: 'Safe Shelter', desc: 'Disaster shelters + watch', icon: <Building2 size={16} className="text-rose-700 dark:text-rose-400" />, badge: '121' },
    { id: 'blooddonor', title: 'Blood Donor', desc: 'Emergency blood registry', icon: <Droplets size={16} className="text-rose-700 dark:text-rose-400" />, badge: '122' },
    { id: 'missingperson', title: 'Missing Person', desc: 'Community alerts for missing people', icon: <Footprints size={16} className="text-rose-700 dark:text-rose-400" />, badge: '123' },
    { id: 'safeescort', title: 'Safe Escort', desc: 'Escort matching + route safety', icon: <HeartPulse size={16} className="text-rose-700 dark:text-rose-400" />, badge: '125' },
    { id: 'sosalert', title: 'SOS Panic', desc: 'Panic alert + emergency contacts', icon: <ShieldAlert size={16} className="text-rose-700 dark:text-rose-400" />, badge: '126' },
    { id: 'safewatch', title: 'Safe Watch', desc: 'Neighborhood safety + hazard reports', icon: <Eye size={16} className="text-rose-700 dark:text-rose-400" />, badge: '127' },
    { id: 'offlinemesh', title: 'Offline Mesh', desc: 'Bluetooth + LAN chat without internet', icon: <Network size={16} className="text-teal-700 dark:text-teal-400" />, badge: '128' },
    { id: 'safehaven', title: 'Safe Haven', desc: 'Safe place / refuge network', icon: <HeartHandshake size={16} className="text-rose-700 dark:text-rose-400" />, badge: '129' },
    { id: 'flooddepth', title: 'Flood Depth', desc: 'Community flood depth mapping', icon: <Waves size={16} className="text-rose-700 dark:text-rose-400" />, badge: '130' },
    { id: 'datasovereignty', title: 'Data Sovereignty', desc: 'Full export + GDPR deletion + consent', icon: <Database size={16} className="text-blue-700 dark:text-blue-400" />, badge: '131' },
    { id: 'e2ee', title: 'E2E Encryption', desc: 'Zero-knowledge encrypted messaging', icon: <Shield size={16} className="text-blue-700 dark:text-blue-400" />, badge: '132' },
    { id: 'privacydashboard', title: 'Privacy Dashboard', desc: 'Access log + third-party + permissions', icon: <Lock size={16} className="text-blue-700 dark:text-blue-400" />, badge: '133' },
    { id: 'anonymous', title: 'Anonymous Mode', desc: 'Pseudonymous identity + incognito posting', icon: <UserRound size={16} className="text-blue-700 dark:text-blue-400" />, badge: '134' },
    { id: 'securevault', title: 'Secure Vault', desc: 'Encrypted notes + photos with biometric unlock', icon: <Key size={16} className="text-blue-700 dark:text-blue-400" />, badge: '135' },
    { id: 'did', title: 'Decentralized DID', desc: 'Portable identity + W3C DIDs', icon: <Hash size={16} className="text-blue-700 dark:text-blue-400" />, badge: '136' },
    { id: 'humanity', title: 'Humanity Score', desc: 'Behavioral biometric verification', icon: <ScanFace size={16} className="text-violet-700 dark:text-violet-400" />, badge: '137' },
    { id: 'botbounty', title: 'Bot-Bounty', desc: 'Report bots, earn coins', icon: <Bot size={16} className="text-violet-700 dark:text-violet-400" />, badge: '138' },
    { id: 'triggerwarnings', title: 'Trigger Warnings', desc: 'Auto-blur sensitive content', icon: <ShieldAlert size={16} className="text-violet-700 dark:text-violet-400" />, badge: '139' },
    { id: 'feedexplain', title: 'Feed Explanation', desc: 'Why did I see this?', icon: <Lightbulb size={16} className="text-violet-700 dark:text-violet-400" />, badge: '140' },
    { id: 'profilesummary', title: 'Profile Summary', desc: 'One-line AI profile bios', icon: <UserRound size={16} className="text-violet-700 dark:text-violet-400" />, badge: '141' },
    { id: 'commentsummary', title: 'Comment Summarizer', desc: 'Sentiment + key points', icon: <MessageSquareText size={16} className="text-violet-700 dark:text-violet-400" />, badge: '142' },
    { id: 'aimoderator', title: 'AI Moderator', desc: 'Auto warn / delete / mute', icon: <Gavel size={16} className="text-violet-700 dark:text-violet-400" />, badge: '143' },
    { id: 'factchecker', title: 'Fact-Checker', desc: 'Claim-level fact checking', icon: <SearchCheck size={16} className="text-violet-700 dark:text-violet-400" />, badge: '144' },
    { id: 'ghostmode', title: 'Ghost Mode', desc: 'View without ranking impact', icon: <Ghost size={16} className="text-violet-700 dark:text-violet-400" />, badge: '145' },
    { id: 'localtranscriber', title: 'Local Transcriber', desc: 'In-browser speech-to-text', icon: <Mic size={16} className="text-violet-700 dark:text-violet-400" />, badge: '146' },
    { id: 'dailyPodcast', title: 'Daily Podcast', desc: 'Personal audio digest', icon: <Podcast size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '147' },
    { id: 'marketNegotiator', title: 'Marketplace Negotiator', desc: 'AI haggles for you', icon: <Store size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '148' },
    { id: 'digitalTwin', title: 'Digital Twin', desc: 'A bot that types like you', icon: <Brain size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '149' },
    { id: 'debateModerator', title: 'Debate Moderator', desc: 'Fair, calm debate rooms', icon: <Scale size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '150' },
    { id: 'algoPanel', title: 'Algo Panel', desc: 'Tune your feed weights', icon: <SlidersHorizontal size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '151' },
    { id: 'auditLog', title: 'Audit Log', desc: 'Why did I see this?', icon: <ScrollText size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '152' },
    { id: 'zeroDoomscroll', title: 'Zero Doomscroll', desc: 'Break after 30 min', icon: <Timer size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '153' },
    { id: 'intentionalScroll', title: 'Intentional Scroll', desc: 'Set a limit first', icon: <TimerReset size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '154' },
    { id: 'focusLock', title: 'Focus Lock', desc: 'Block distracting tabs', icon: <LockKeyhole size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '155' },
    { id: 'upliftFeed', title: 'Uplift Feed', desc: 'Positive-only feed', icon: <SunMedium size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '156' },
    { id: 'sensorySafe', title: 'Sensory-Safe', desc: 'Calm, still, low-contrast', icon: <Accessibility size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '157' },
    { id: 'takeABreath', title: 'Take a Breath', desc: 'Rapid-scroll pause', icon: <Wind size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '158' },
    { id: 'memoryRecaps', title: 'Memory Recaps', desc: 'On-this-day chats, reels, voice', icon: <History size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '160' },
    { id: 'collabPosts', title: 'Collab Posts', desc: 'Multi-author posts + edit', icon: <Users size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '162' },
    { id: 'storyChains', title: 'Story Chains', desc: 'Chain stories, add your twist', icon: <BookOpen size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '163' },
    { id: 'streaks', title: 'Meaningful Streaks', desc: 'Learning / creator / helper', icon: <Flame size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '164' },
    { id: 'achievements', title: 'Achievements', desc: 'Milestone badges & unlocks', icon: <Trophy size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '165' },
    { id: 'reputation', title: 'Reputation', desc: 'Content-quality weighted score', icon: <Star size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '166' },
    { id: 'silentDrop', title: 'Silent Drop', desc: 'Vanishing post, 50 viewers', icon: <TimerOff size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '167' },
    { id: 'stealthRec', title: 'Stealth Recommend', desc: 'Signal a friend a post', icon: <Send size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '168' },
    { id: 'escrow', title: 'Smart Escrow', desc: 'Time-locked wallet escrow', icon: <HandCoins size={16} className="text-rose-700 dark:text-rose-400" />, badge: '171' },
    { id: 'p2pRenting', title: 'P2P Renting', desc: 'Rent gear by the hour', icon: <KeyRound size={16} className="text-rose-700 dark:text-rose-400" />, badge: '172' },
    { id: 'barter', title: 'Barter Exchange', desc: 'Swap skills & items, no coins', icon: <Repeat size={16} className="text-rose-700 dark:text-rose-400" />, badge: '173' },
    { id: 'gigRadar', title: 'Gig Radar', desc: 'Quick cash jobs nearby', icon: <Radar size={16} className="text-rose-700 dark:text-rose-400" />, badge: '174' },
    { id: 'groupBuy', title: 'Group Buying', desc: 'Pool quantities for bulk price', icon: <ShoppingCart size={16} className="text-rose-700 dark:text-rose-400" />, badge: '175' },
    { id: 'buyNothing', title: 'Buy-Nothing Group', desc: 'Give & request, always free', icon: <Gift size={16} className="text-rose-700 dark:text-rose-400" />, badge: '176' },
    { id: 'garageSale', title: 'Garage Sale Map', desc: 'Weekend sales on a map', icon: <MapPin size={16} className="text-rose-700 dark:text-rose-400" />, badge: '177' },
    { id: 'chitFund', title: 'Chit Fund', desc: 'Rotating savings committees', icon: <PiggyBank size={16} className="text-rose-700 dark:text-rose-400" />, badge: '179' },
    { id: 'savingCircle', title: 'Saving Circle', desc: 'Micro-investment groups', icon: <Sprout size={16} className="text-rose-700 dark:text-rose-400" />, badge: '180' },
    { id: 'subscriptionManager', title: 'Subscription Manager', desc: 'Split shared subs fairly', icon: <Layers size={16} className="text-rose-700 dark:text-rose-400" />, badge: '181' },
    { id: 'dataMarketplace', title: 'Data Marketplace', desc: 'Opt-in anonymized data', icon: <BarChart3 size={16} className="text-rose-700 dark:text-rose-400" />, badge: '182' },
    { id: 'mandiPrices', title: 'Mandi Predictor', desc: 'Wholesale price forecast', icon: <Wheat size={16} className="text-lime-700 dark:text-lime-400" />, badge: '184' },
    { id: 'farmLive', title: 'Farmer Live', desc: 'Buy straight from the field', icon: <Radio size={16} className="text-lime-700 dark:text-lime-400" />, badge: '185' },
    { id: 'cropDiagnosis', title: 'Crop Scanner', desc: 'Diagnose plant diseases', icon: <Stethoscope size={16} className="text-lime-700 dark:text-lime-400" />, badge: '186' },
    { id: 'irrigation', title: 'Irrigation Scheduler', desc: 'Watering plan + forecast', icon: <CloudRain size={16} className="text-lime-700 dark:text-lime-400" />, badge: '187' },
    { id: 'farmToolPool', title: 'Farm Tool Pool', desc: 'Share tractors & gear', icon: <Tractor size={16} className="text-lime-700 dark:text-lime-400" />, badge: '188' },
    { id: 'carbonLedger', title: 'Carbon Ledger', desc: 'Footprint + offset trees', icon: <Leaf size={16} className="text-lime-700 dark:text-lime-400" />, badge: '189' },
    { id: 'afforestation', title: 'Afforestation', desc: 'Plant, verify, earn coins', icon: <TreePine size={16} className="text-lime-700 dark:text-lime-400" />, badge: '190' },
    { id: 'plasticWealth', title: 'Plastic-to-Wealth', desc: 'Recycle plastic for coins', icon: <Recycle size={16} className="text-lime-700 dark:text-lime-400" />, badge: '191' },
    { id: 'interview', title: 'Mock Interview', desc: 'AI practice interview + scoring', icon: <Briefcase size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '192' },
    { id: 'portfolio', title: 'Freelancer Portfolio', desc: 'Verified portfolio pages', icon: <FileText size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '193' },
    { id: 'resume', title: 'Resume Builder', desc: 'Print-ready resume from profile', icon: <FileText size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '194' },
    { id: 'paircoding', title: 'Pair Coding', desc: 'Shared terminal sessions', icon: <Terminal size={16} className="text-zinc-700 dark:text-zinc-300" />, badge: '195' },
    { id: 'internships', title: 'Internship Board', desc: 'Postings & applications', icon: <Briefcase size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '196' },
    { id: 'jobalerts', title: 'Govt Job Alerts', desc: 'Circular tracker + bookmarks', icon: <Landmark size={16} className="text-teal-700 dark:text-teal-400" />, badge: '197' },
    { id: 'tutor', title: 'Tutor Matchmaking', desc: 'Home tutors ↔ students', icon: <GraduationCap size={16} className="text-orange-700 dark:text-orange-400" />, badge: '198' },
    { id: 'assignmenthelp', title: 'Assignment Help', desc: 'Skill exchange + coin rewards', icon: <PenTool size={16} className="text-fuchsia-700 dark:text-fuchsia-400" />, badge: '199' },
    { id: 'examroom', title: 'Exam War Room', desc: 'Countdown + papers + notes', icon: <ClipboardList size={16} className="text-rose-700 dark:text-rose-400" />, badge: '200' },
    { id: 'scholarships', title: 'Scholarships', desc: 'Aggregated funding tracker', icon: <Award size={16} className="text-sky-700 dark:text-sky-400" />, badge: '201' },
    { id: 'familycircle', title: 'Family Circle', desc: 'Check-ins + location share', icon: <Users size={16} className="text-pink-700 dark:text-pink-400" />, badge: '202' },
    { id: 'contentgate', title: 'Age Content Gate', desc: 'Rate posts for 18+/16+/13+', icon: <ShieldAlert size={16} className="text-amber-700 dark:text-amber-400" />, badge: '203' },
    { id: 'eldermode', title: 'Elder Mode', desc: 'Large fonts, high contrast', icon: <Accessibility size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '204' },
    { id: 'guardian', title: 'Trusted Guardian', desc: 'Guardian approval workflow', icon: <ShieldCheck size={16} className="text-sky-700 dark:text-sky-400" />, badge: '205' },
    { id: 'periodtracker', title: 'Period Tracker', desc: 'Encrypted, on-device only', icon: <Droplets size={16} className="text-rose-700 dark:text-rose-400" />, badge: '206' },
    { id: 'evidencevault', title: 'Evidence Vault', desc: 'Encrypted harassment locker', icon: <Lock size={16} className="text-zinc-700 dark:text-zinc-300" />, badge: '207' },
    { id: 'lawyermatch', title: 'Pro-Bono Lawyers', desc: 'Case ↔ lawyer matching', icon: <Scale size={16} className="text-slate-700 dark:text-slate-300" />, badge: '208' },
    { id: 'legalaid', title: 'Legal First-Aid', desc: 'AI guidance + helplines', icon: <Gavel size={16} className="text-slate-700 dark:text-slate-300" />, badge: '209' },
    { id: 'contracts', title: 'Contract Builder', desc: 'Templates + e-signatures', icon: <FileSignature size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '210' },
    { id: 'rtifiler', title: 'RTI Auto-Filer', desc: 'Generate, file, track 30-day', icon: <FileText size={16} className="text-blue-700 dark:text-blue-400" />, badge: '211' },
    { id: 'digitalfir', title: 'Digital FIR / GD', desc: 'Lodge & track records', icon: <ShieldAlert size={16} className="text-red-700 dark:text-red-400" />, badge: '212' },
    { id: 'wardbudget', title: 'Ward Budget', desc: 'Vote on ward projects', icon: <Vote size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '213' },
    { id: 'wardsabha', title: 'Ward Sabha', desc: 'Digital town-hall meetings', icon: <Landmark size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '214' },
    { id: 'civicescalation', title: 'Civic Escalation', desc: 'Issue ladder → ombudsman', icon: <TrendingUp size={16} className="text-orange-700 dark:text-orange-400" />, badge: '215' },
    { id: 'tenders', title: 'Tender Tracker', desc: 'Bids + rigging anomalies', icon: <AlertTriangle size={16} className="text-teal-700 dark:text-teal-400" />, badge: '216' },
    { id: 'landtrust', title: 'Land Trust', desc: 'Community-owned parcels', icon: <LandPlot size={16} className="text-lime-700 dark:text-lime-400" />, badge: '217' },
    { id: 'biodata', title: 'Bio-Data Builder', desc: 'Marriage bio-data → PDF', icon: <BookUser size={16} className="text-teal-700 dark:text-teal-400" />, badge: '218' },
    { id: 'chaperone', title: 'Chaperone Mode', desc: 'Read-only chat observers', icon: <Eye size={16} className="text-sky-700 dark:text-sky-400" />, badge: '219' },
    { id: 'compatibility', title: 'Compatibility', desc: 'Score a potential match', icon: <HeartHandshake size={16} className="text-rose-700 dark:text-rose-400" />, badge: '220' },
    { id: 'halaltimeline', title: 'Halal Timeline', desc: 'Staged relationship progress', icon: <Heart size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '221' },
    { id: 'matchmaker', title: 'Matchmaker', desc: 'Community-suggested matches', icon: <HeartHandshake size={16} className="text-amber-700 dark:text-amber-400" />, badge: '222' },
    { id: 'azan', title: 'Azan Auto-Mute', desc: 'Quiet during prayer times', icon: <BellOff size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '223' },
    { id: 'zakat', title: 'Zakat Calculator', desc: '2.5% above nisab', icon: <Calculator size={16} className="text-amber-700 dark:text-amber-400" />, badge: '224' },
    { id: 'venues', title: 'Venue Live Status', desc: 'Crowds & opening status', icon: <Building2 size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '225' },
    { id: 'qurancircle', title: 'Quran Circles', desc: 'Voice study rooms', icon: <BookOpen size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '226' },
    { id: 'religousevents', title: 'Religious Events', desc: 'RSVP + organizer updates', icon: <CalendarHeart size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '227' },
    { id: 'travelbuddy', title: 'Travel Buddy', desc: 'Match on route & dates', icon: <Plane size={16} className="text-sky-700 dark:text-sky-400" />, badge: '228' },
    { id: 'hiddengems', title: 'Hidden Gems', desc: 'GPS scenic spot drops', icon: <Gem size={16} className="text-fuchsia-700 dark:text-fuchsia-400" />, badge: '229' },
    { id: 'grouptrip', title: 'Group Trip', desc: 'Itinerary + shared budget', icon: <Luggage size={16} className="text-violet-700 dark:text-violet-400" />, badge: '230' },
    { id: 'carpool', title: 'Carpool Lane', desc: 'Office ride sharing', icon: <CarFront size={16} className="text-blue-700 dark:text-blue-400" />, badge: '231' },
    { id: 'bikepool', title: 'Bike Pool', desc: 'Student two-wheeler share', icon: <Bike size={16} className="text-blue-700 dark:text-blue-400" />, badge: '232' },
    { id: 'cngfare', title: 'CNG Fare Radar', desc: 'Fair fare + community reports', icon: <CarTaxiFront size={16} className="text-yellow-700 dark:text-yellow-400" />, badge: '233' },
    { id: 'parking', title: 'Parking Share', desc: 'Rent spots by the hour', icon: <ParkingSquare size={16} className="text-slate-700 dark:text-slate-300" />, badge: '234' },
    { id: 'trafficwitness', title: 'Traffic Witness', desc: 'Community violation reports', icon: <Camera size={16} className="text-red-700 dark:text-red-400" />, badge: '235' },
    { id: 'fediverse', title: 'Fediverse Bridge', desc: 'Federate posts to ActivityPub', icon: <Share2 size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '236' },
    { id: 'zkkyc', title: 'Zero-Knowledge KYC', desc: 'Prove facts without revealing them', icon: <Fingerprint size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '237' },
    { id: 'hardwarewallet', title: 'Hardware Wallet', desc: 'Sign with a physical device', icon: <Usb size={16} className="text-amber-700 dark:text-amber-400" />, badge: '238' },
    { id: 'satellite', title: 'Satellite Fallback', desc: 'Never lose a message offline', icon: <Satellite size={16} className="text-sky-700 dark:text-sky-400" />, badge: '239' },
    { id: 'quantumcrypto', title: 'Quantum Crypto', desc: 'Post-quantum secure channel', icon: <Atom size={16} className="text-violet-700 dark:text-violet-400" />, badge: '240' },
    { id: 'federatedlearning', title: 'Federated Learning', desc: 'Train locally, share deltas only', icon: <BrainCircuit size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '241' },
    { id: 'watermark', title: 'Media Watermark', desc: 'C2PA provenance for AI media', icon: <Stamp size={16} className="text-fuchsia-700 dark:text-fuchsia-400" />, badge: '242' },
    { id: 'redteam', title: 'Red-Team Arena', desc: 'Hunt AI vulnerabilities, earn bounties', icon: <Swords size={16} className="text-red-700 dark:text-red-400" />, badge: '243' },
    { id: 'personas', title: 'Contextual Personas', desc: 'Multiple identities, one account', icon: <UserCog size={16} className="text-violet-700 dark:text-violet-400" />, badge: '244' },
    { id: 'moodfeed', title: 'Mood Feed', desc: 'Feed filtered by sentiment', icon: <Smile size={16} className="text-amber-700 dark:text-amber-400" />, badge: '245' },
    { id: 'deepdive', title: 'Deep Dive Mode', desc: 'Topic hubs for long-form reads', icon: <BookMarked size={16} className="text-teal-700 dark:text-teal-400" />, badge: '246' },
    { id: 'skillexchange', title: 'Skill Exchange', desc: 'Teach what you learn', icon: <Repeat2 size={16} className="text-orange-700 dark:text-orange-400" />, badge: '247' },
    { id: 'alumni', title: 'Alumni Network', desc: 'Find batchmates & mentors', icon: <GraduationCap size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '248' },
    { id: 'verifiedlive', title: 'Verified Live', desc: 'Proof-of-location anti fake-news badge', icon: <BadgeCheck size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '120 · live' },
    { id: 'safetyshorts', title: 'Self-Defense Shorts', desc: '30-second safety drills', icon: <ShieldCheck size={16} className="text-rose-700 dark:text-rose-400" />, badge: '126 · safety' },
    { id: 'evacuation', title: 'Evacuation Routes', desc: 'Cyclone-safe shelter routes', icon: <Waves size={16} className="text-rose-700 dark:text-rose-400" />, badge: '128 · evac' },
    { id: 'kitchens', title: 'Community Kitchens', desc: 'Disaster meal coordination', icon: <UtensilsCrossed size={16} className="text-amber-700 dark:text-amber-400" />, badge: '129 · kitchen' },
    { id: 'relationtimeline', title: 'Relationship Timeline', desc: 'First message, call & shared groups', icon: <History size={16} className="text-emerald-700 dark:text-emerald-400" />, badge: '02' },
    { id: 'splitbill', title: 'Split Bill in Chat', desc: 'Itemized bills + coin settlement', icon: <Receipt size={16} className="text-rose-700 dark:text-rose-400" />, badge: '04' },
    { id: 'voicesummary', title: 'Voice Summarizer', desc: 'Transcribe + summarize voice notes', icon: <Mic size={16} className="text-violet-700 dark:text-violet-400" />, badge: '05' },
    { id: 'studyrooms', title: 'Study Rooms', desc: 'Focus rooms + Pomodoro presence', icon: <BookOpen size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '06' },
    { id: 'eventgroups', title: 'Event Groups', desc: 'Self-destructing group chats', icon: <CalendarX size={16} className="text-orange-700 dark:text-orange-400" />, badge: '11' },
    { id: 'marketplace', title: 'Hyperlocal Marketplace', desc: 'Sell, free & services nearby', icon: <Store size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '09' },
    { id: 'oceanpay', title: 'Ocean Pay', desc: 'P2P coins + /pay in chat', icon: <Coins size={16} className="text-amber-700 dark:text-amber-400" />, badge: '19' },
    { id: 'digitallegacy', title: 'Digital Legacy', desc: 'Memorial plan + legacy contact', icon: <HeartHandshake size={16} className="text-pink-700 dark:text-pink-400" />, badge: '20' },
    { id: 'offlinedrafts', title: 'Offline Drafts', desc: 'Autosave + smart sync queue', icon: <CloudOff size={16} className="text-sky-700 dark:text-sky-400" />, badge: '14' },
    { id: 'missingface', title: 'Missing Person — Visual Match', desc: 'Privacy-first face search from relief photos', icon: <Camera size={16} className="text-rose-700 dark:text-rose-400" />, badge: '130 · face' },
    { id: 'proximityalert', title: 'Proximity Alert', desc: 'Silent anti-stalking alerts for blocked users', icon: <EyeOff size={16} className="text-slate-700 dark:text-slate-300" />, badge: '136 · stalk' },
    { id: 'stories2', title: 'Stories 2.0', desc: '24h stories: camera, polls, Q&A, music, close friends', icon: <Sparkles size={16} className="text-fuchsia-700 dark:text-fuchsia-400" />, badge: '249' },
    { id: 'oceancutvideo', title: 'Ocean Cut — Video', desc: 'FFmpeg.wasm trim/cut/speed + Bengali subtitles', icon: <Clapperboard size={16} className="text-rose-700 dark:text-rose-400" />, badge: '250' },
    { id: 'oceancutphoto', title: 'Ocean Cut — Photo', desc: 'Filters, crop, stickers, bg removal, AI enhance', icon: <Camera size={16} className="text-sky-700 dark:text-sky-400" />, badge: '251' },
    { id: 'liveecosystem', title: 'Live Gifts', desc: 'Gift streams, goals, clips, leaderboard + mod tools', icon: <Gift size={16} className="text-rose-700 dark:text-rose-400" />, badge: '252' },
    { id: 'miniapps', title: 'Mini Apps', desc: 'Sandboxed iframe apps + wallet purchases (30%)', icon: <Blocks size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '253' },
    { id: 'communitiespro', title: 'Communities Pro', desc: 'Voice rooms, stages, threads, server templates', icon: <MessagesSquare size={16} className="text-blue-700 dark:text-blue-400" />, badge: '254' },
    { id: 'creatormonetization', title: 'Creator Monetization', desc: 'Revenue dashboard, brand deals, affiliate, CRM', icon: <Wallet size={16} className="text-amber-700 dark:text-amber-400" />, badge: '255' },
    { id: 'prograph', title: 'Pro Graph', desc: 'Skills, endorsements, validation, job matching', icon: <Briefcase size={16} className="text-indigo-700 dark:text-indigo-400" />, badge: '256' },
    { id: 'creationlab', title: 'Creation Lab', desc: 'Green screen, duet/stitch, beat sync, AR overlay', icon: <Wand2 size={16} className="text-fuchsia-700 dark:text-fuchsia-400" />, badge: '257' },
    { id: 'snapmap', title: 'Ocean Map + Snap', desc: 'Story heatmap, opt-in location, private stories', icon: <MapPin size={16} className="text-pink-700 dark:text-pink-400" />, badge: '258' },
    { id: 'oslayer', title: 'Ocean OS Layer', desc: 'A/B experiments, feature flags, edge regions', icon: <FlaskConical size={16} className="text-amber-700 dark:text-amber-400" />, badge: '259' },
    { id: 'databrain', title: 'Data + AI Brain', desc: 'Observability, creator analytics, warehouse export', icon: <BrainCircuit size={16} className="text-cyan-700 dark:text-cyan-400" />, badge: '260' },
  ];

  return (
    <AnimatePresence>
      {active === 'whiteboard' && <CallWhiteboard token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'visualsearch' && <VisualSearch token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'collabreels' && <CollaborativeReels token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'revenue' && <RevenueShare token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'subscriptions' && <MicroSubscriptions token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'costream' && <CoStreaming token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'bounties' && <ReelBounties token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'faceless' && <FacelessVideoGenerator token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'trendingsounds' && <TrendingSounds token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'smartcommunity' && <SmartCommunity token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safesos' && <SafeSOSView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safetyshield' && <SafetyShieldView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safeshelter' && <SafeShelterView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'blooddonor' && <BloodDonorRegistry token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'missingperson' && <MissingPersonView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safeescort' && <SafeEscortView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'sosalert' && <SOSAlertView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safewatch' && <SafeWatchView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'offlinemesh' && <OfflineChatView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safehaven' && <SafeHavenView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'flooddepth' && <FloodDepthMapperView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'datasovereignty' && <DataSovereigntyView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'e2ee' && <E2EEMessenger token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'privacydashboard' && <PrivacyDashboard token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'anonymous' && <AnonymousMode token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'did' && <DecentralizedProfiles token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'securevault' && <SecureVaultView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'humanity' && <HumanityScore token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'botbounty' && <BotBounty token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'triggerwarnings' && <TriggerWarnings token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'feedexplain' && <FeedExplainer token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'profilesummary' && <ProfileSummary token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'commentsummary' && <CommentSummary token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'aimoderator' && <AIModerator token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'factchecker' && <FactChecker token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'ghostmode' && <GhostMode token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'localtranscriber' && <LocalTranscriber token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'dailyPodcast' && <DailyPodcast token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'marketNegotiator' && <MarketNegotiator token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'digitalTwin' && <DigitalTwin token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'debateModerator' && <DebateModerator token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'algoPanel' && <AlgoPanel token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'auditLog' && <AuditLog token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'zeroDoomscroll' && <ZeroDoomscroll token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'intentionalScroll' && <IntentionalScroll token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'focusLock' && <FocusLock token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'upliftFeed' && <UpliftFeed token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'sensorySafe' && <SensorySafeMode token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'takeABreath' && <TakeABreath token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'memoryRecaps' && <MemoryRecaps token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'collabPosts' && <CollabPosts token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'storyChains' && <StoryChains token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'streaks' && <Streaks token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'achievements' && <Achievements token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'reputation' && <Reputation token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'silentDrop' && <SilentDrop token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'stealthRec' && <StealthRec token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'escrow' && <Escrow token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'p2pRenting' && <P2PRenting token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'barter' && <BarterExchange token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'gigRadar' && <GigRadar token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'groupBuy' && <GroupBuy token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'buyNothing' && <BuyNothing token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'garageSale' && <GarageSaleMap token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'chitFund' && <ChitFund token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'savingCircle' && <SavingCircle token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'subscriptionManager' && <SubscriptionManager token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'dataMarketplace' && <DataMarketplace token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'mandiPrices' && <MandiPrices token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'farmLive' && <FarmLive token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'cropDiagnosis' && <CropDiagnosis token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'irrigation' && <IrrigationScheduler token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'farmToolPool' && <FarmToolPool token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'carbonLedger' && <CarbonLedger token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'afforestation' && <Afforestation token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'plasticWealth' && <PlasticWealth token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'interview' && <InterviewRoom token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'portfolio' && <Portfolio token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'resume' && <ResumeBuilder token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'paircoding' && <PairCoding token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'internships' && <InternshipBoard token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'jobalerts' && <JobAlerts token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'tutor' && <TutorMatch token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'assignmenthelp' && <AssignmentHelp token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'examroom' && <ExamWarRoom token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'scholarships' && <ScholarshipTracker token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'familycircle' && <FamilyCircle token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'contentgate' && <ContentGate token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'eldermode' && <ElderMode token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'guardian' && <GuardianApproval token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'periodtracker' && <PeriodTracker token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'evidencevault' && <EvidenceVault token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'lawyermatch' && <LawyerMatch token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'legalaid' && <LegalAid token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'contracts' && <ContractBuilder token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'rtifiler' && <RTIFiler token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'digitalfir' && <DigitalFIR token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'wardbudget' && <WardCivic token={token} currentUser={currentUser} onClose={() => setActive(null)} initialTab="projects" />}
      {active === 'wardsabha' && <WardCivic token={token} currentUser={currentUser} onClose={() => setActive(null)} initialTab="meetings" />}
      {active === 'civicescalation' && <CivicEscalation token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'tenders' && <TenderTracker token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'landtrust' && <LandTrust token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'biodata' && <BioDataBuilder token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'chaperone' && <ChaperoneMode token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'compatibility' && <CompatibilityMatrix token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'halaltimeline' && <HalalTimeline token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'matchmaker' && <CommunityMatchmaker token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'azan' && <AzanAutoMute token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'zakat' && <ZakatCalculator token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'venues' && <VenueStatus token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'qurancircle' && <QuranCircle token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'religousevents' && <ReligiousEvents token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'travelbuddy' && <TravelBuddy token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'hiddengems' && <HiddenGems token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'grouptrip' && <GroupTrip token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'carpool' && <Carpool token={token} currentUser={currentUser} onClose={() => setActive(null)} initialKind="car" />}
      {active === 'bikepool' && <Carpool token={token} currentUser={currentUser} onClose={() => setActive(null)} initialKind="bike" />}
      {active === 'cngfare' && <CNGFare token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'parking' && <ParkingShare token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'trafficwitness' && <TrafficWitness token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'fediverse' && <FediverseBridge token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'zkkyc' && <ZKKYC token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'hardwarewallet' && <HardwareWallet token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'satellite' && <SatelliteFallback token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'quantumcrypto' && <QuantumCrypto token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'federatedlearning' && <FederatedLearning token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'watermark' && <WatermarkStudio token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'redteam' && <RedTeamArena token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'personas' && <Personas token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'moodfeed' && <MoodFeed token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'deepdive' && <DeepDive token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'skillexchange' && <SkillExchange token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'alumni' && <AlumniNetwork token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'verifiedlive' && <VerifiedLive token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'safetyshorts' && <SafetyShorts token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'evacuation' && <EvacuationRoutes token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'kitchens' && <CommunityKitchens token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'relationtimeline' && <RelationshipTimeline token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'splitbill' && <SplitBillView token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'voicesummary' && <VoiceSummary token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'studyrooms' && <StudyRooms token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'eventgroups' && <EventGroups token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'marketplace' && <Marketplace token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'oceanpay' && <OceanPay token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'digitallegacy' && <DigitalLegacy token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'offlinedrafts' && <OfflineDrafts token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'missingface' && <MissingFaceSearch token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'proximityalert' && <ProximityAlert token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'stories2' && <Stories2 token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'oceancutvideo' && <OceanCutVideo token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'oceancutphoto' && <OceanCutPhoto token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'liveecosystem' && <LiveEcosystem token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'miniapps' && <MiniAppStore token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'communitiespro' && <CommunitiesPro token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'creatormonetization' && <CreatorMonetization token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'prograph' && <ProGraph token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'creationlab' && <CreationLab token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'snapmap' && <SnapMap token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'oslayer' && <OSLayer token={token} currentUser={currentUser} onClose={() => setActive(null)} />}
      {active === 'databrain' && <DataBrain token={token} currentUser={currentUser} onClose={() => setActive(null)} />}

      {!active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shapes size={18} className="text-amber-800 dark:text-amber-400" />
                <h2 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 tracking-tight">
                  New Features
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400">
                  Ocean 109+
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f) => (
                <button
                  key={f.id}
                  onClick={() => f.id && setActive(f.id)}
                  className="flex flex-col items-start gap-1 p-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-zinc-800/60 transition-all text-left"
                >
                  <div className="flex items-center gap-2 w-full">
                    {f.icon}
                    <span className="font-bold text-[11px] text-[#3a342a] dark:text-zinc-100">{f.title}</span>
                    <span className="ml-auto font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">#{f.badge}</span>
                  </div>
                  <span className="text-[9px] text-[#8a8172] dark:text-zinc-400">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
