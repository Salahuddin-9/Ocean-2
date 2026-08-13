import { UserProfile } from './types';

export const DEFAULT_PROFILE: UserProfile = {
  name: "Alex Rivera",
  username: "alexrivera",
  avatarUrl: "", // Empty string means use default monogram or beautiful generated vector representation
  bio: "Creative developer designing tactile interfaces and clean web apps.",
  tagline: "Creative Technologist & Interface Designer",
  location: "San Francisco, CA",
  availability: "Available",
  badgeNumber: "BD-44-230-11-98-345",
  sinceDate: "July 2026",
  viewsCount: 1420,
  followersCount: 320,
  postsCount: 2,
  projectsCount: 3,
  skillsCount: 8,
  isLocationVerified: true,
  countryCode: "US",
  skills: [
    "TypeScript",
    "React / Next.js",
    "Tailwind CSS",
    "Node.js",
    "GraphQL",
    "Figma",
    "Motion / Framer",
    "Web Performance"
  ],
  projects: [
    {
      id: "proj-1",
      title: "Synthesizer Dashboard",
      description: "An interactive modular synthesizer layout with real-time waveform visualization, canvas-based frequency dials, and custom MIDI key mapping.",
      demoUrl: "https://synth-example.com",
      githubUrl: "https://github.com/alexrivera/synth-dashboard",
      tags: ["React", "Web Audio API", "HTML5 Canvas", "Tailwind CSS"]
    },
    {
      id: "proj-2",
      title: "Tactile Markdown Editor",
      description: "A gorgeous minimalist distraction-free editor with instant side-by-side markdown compiling, visual focus modes, and local backup engines.",
      demoUrl: "https://markdown-example.com",
      githubUrl: "https://github.com/alexrivera/tactile-md",
      tags: ["TypeScript", "Markdown", "localStorage", "Motion"]
    },
    {
      id: "proj-3",
      title: "Fluid Physics Particle System",
      description: "A canvas-rendered 2D physics demonstration exploring gravitational attractions, particle collisions, and responsive drag-and-drop boundary controls.",
      demoUrl: "https://physics-example.com",
      githubUrl: "https://github.com/alexrivera/particle-physics",
      tags: ["HTML5 Canvas", "Physics Engine", "Vite", "TypeScript"]
    }
  ],
  websites: [
    {
      id: "web-1",
      title: "Creative Agency Showcase",
      description: "A production-grade agency landing page built using clean, semantic HTML5 structure, responsive flexbox, CSS Grid layouts, and custom keyframe animations.",
      demoUrl: "https://agency-html.example.com",
      githubUrl: "https://github.com/alexrivera/agency-html",
      thumbnailUrl: "",
      techStack: ["HTML5", "CSS3 Variables", "Vanilla JS", "Flexbox"]
    },
    {
      id: "web-2",
      title: "Retro 1995 Terminal Console",
      description: "An interactive command-line style profile with live file listing simulation, interactive themes, and vintage phosphor scanline CRT CSS overlays.",
      demoUrl: "https://terminal-html.example.com",
      githubUrl: "https://github.com/alexrivera/terminal-retro",
      thumbnailUrl: "",
      techStack: ["Semantic HTML", "Custom Fonts", "Vanilla JS", "CRT Filters"]
    }
  ],
  contact: {
    email: "alex.rivera@example.com",
    github: "github.com/alexrivera",
    linkedin: "linkedin.com/in/alexrivera",
    twitter: "twitter.com/alex_rivera",
    website: "alexrivera.dev"
  },
  posts: [],
  isPrivate: false,
  allowConnections: true,
  isPublicMessagingEnabled: true
};
