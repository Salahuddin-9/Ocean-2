-- ============================================================================
-- TURTLE SOCIAL MEDIA PLATFORM - DATABASE SCHEMA SPECIFICATION
-- Target: Supabase / PostgreSQL 15+
-- Focus: Strict Constraints, High-Performance Indexes, Robust RLS Policies
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Clean Slate (Optional - uncomment if running in fresh environment)
-- drop schema public cascade;
-- create schema public;

-- ==========================================
-- 1. profiles
-- ==========================================
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    username text unique not null,
    display_name text,
    avatar_url text,
    tagline text,
    is_moderator boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint username_length check (char_length(username) >= 3)
);

-- ==========================================
-- 2. user_settings
-- ==========================================
create table public.user_settings (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    allow_random_match boolean default true not null,
    who_can_see_my_posts text default 'everyone'::text not null,
    who_can_message_me text default 'everyone'::text not null,
    enable_time_capsule_notifications boolean default true not null,
    two_factor_enabled boolean default false not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_privacy_posts check (who_can_see_my_posts in ('everyone', 'friends', 'nobody')),
    constraint check_privacy_msg check (who_can_message_me in ('everyone', 'friends'))
);

-- ==========================================
-- 3. emergency_pools
-- ==========================================
create table public.emergency_pools (
    id uuid default uuid_generate_v4() primary key,
    creator_id uuid references public.profiles(id) on delete set null,
    title text not null,
    description text,
    target_funding numeric(12, 2) not null check (target_funding > 0),
    current_funding numeric(12, 2) default 0.00 not null check (current_funding >= 0),
    vote_threshold_pct integer default 66 not null check (vote_threshold_pct between 50 and 100),
    status text default 'funding'::text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    expires_at timestamp with time zone not null,
    constraint check_status check (status in ('funding', 'voting', 'disbursed', 'expired')),
    constraint check_dates check (expires_at > created_at)
);

-- ==========================================
-- 4. user_emergency_pool_memberships
-- ==========================================
create table public.user_emergency_pool_memberships (
    pool_id uuid references public.emergency_pools(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (pool_id, user_id)
);

-- ==========================================
-- 5. emergency_alerts
-- ==========================================
create table public.emergency_alerts (
    id uuid default uuid_generate_v4() primary key,
    pool_id uuid references public.emergency_pools(id) on delete cascade,
    sender_id uuid references public.profiles(id) on delete cascade,
    message_content text not null,
    severity text default 'warning'::text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_severity check (severity in ('info', 'warning', 'critical'))
);

-- ==========================================
-- 6. posts
-- ==========================================
create table public.posts (
    id uuid default uuid_generate_v4() primary key,
    creator_id uuid references public.profiles(id) on delete cascade not null,
    content_text text,
    visibility text default 'everyone'::text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_post_visibility check (visibility in ('everyone', 'friends', 'private'))
);

-- ==========================================
-- 7. post_media
-- ==========================================
create table public.post_media (
    id uuid default uuid_generate_v4() primary key,
    post_id uuid references public.posts(id) on delete cascade not null,
    media_url text not null,
    media_type text not null, -- 'image', 'video'
    sort_order integer default 0 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 8. post_reactions
-- ==========================================
create table public.post_reactions (
    post_id uuid references public.posts(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    reaction_type text not null, -- 'like', 'love', 'insight', 'support'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (post_id, user_id),
    constraint check_reaction_type check (reaction_type in ('like', 'love', 'insight', 'support'))
);

-- ==========================================
-- 9. post_comments
-- ==========================================
create table public.post_comments (
    id uuid default uuid_generate_v4() primary key,
    post_id uuid references public.posts(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    comment_text text not null,
    parent_comment_id uuid references public.post_comments(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 10. ai_caption_suggestions
-- ==========================================
create table public.ai_caption_suggestions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    prompt_context text not null,
    suggested_captions jsonb not null, -- Array of string suggestions
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 11. time_capsules
-- ==========================================
create table public.time_capsules (
    id uuid default uuid_generate_v4() primary key,
    creator_id uuid references public.profiles(id) on delete cascade not null,
    encrypted_content text not null, -- Encrypted payload
    unlock_at timestamp with time zone not null,
    is_unlocked boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 12. friendships
-- ==========================================
create table public.friendships (
    user_id_1 uuid references public.profiles(id) on delete cascade,
    user_id_2 uuid references public.profiles(id) on delete cascade,
    established_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (user_id_1, user_id_2),
    constraint check_friend_order check (user_id_1 < user_id_2)
);

-- ==========================================
-- 13. friend_requests
-- ==========================================
create table public.friend_requests (
    sender_id uuid references public.profiles(id) on delete cascade,
    receiver_id uuid references public.profiles(id) on delete cascade,
    status text default 'pending'::text not null, -- 'pending', 'rejected'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (sender_id, receiver_id),
    constraint check_no_self_request check (sender_id <> receiver_id),
    constraint check_req_status check (status in ('pending', 'rejected'))
);

-- ==========================================
-- 14. chats
-- ==========================================
create table public.chats (
    id uuid default uuid_generate_v4() primary key,
    title text,
    is_group boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 15. chat_members
-- ==========================================
create table public.chat_members (
    chat_id uuid references public.chats(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (chat_id, user_id)
);

-- ==========================================
-- 16. messages
-- ==========================================
create table public.messages (
    id uuid default uuid_generate_v4() primary key,
    chat_id uuid references public.chats(id) on delete cascade not null,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    encrypted_payload text not null,
    initialization_vector text not null,
    read_receipt boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 17. notifications
-- ==========================================
create table public.notifications (
    id uuid default uuid_generate_v4() primary key,
    recipient_id uuid references public.profiles(id) on delete cascade not null,
    sender_id uuid references public.profiles(id) on delete cascade,
    notification_type text not null, -- 'friend_request', 'message', 'pool_alert', 'channel_publish'
    reference_id uuid, -- Reference key to active resource
    is_read boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_notif_type check (notification_type in ('friend_request', 'message', 'pool_alert', 'channel_publish'))
);

-- ==========================================
-- 18. channels
-- ==========================================
create table public.channels (
    id uuid default uuid_generate_v4() primary key,
    owner_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    description text,
    subscriber_count integer default 0 not null check (subscriber_count >= 0),
    verified_category text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 19. channel_subscriptions
-- ==========================================
create table public.channel_subscriptions (
    channel_id uuid references public.channels(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (channel_id, user_id)
);

-- ==========================================
-- 20. channel_videos
-- ==========================================
create table public.channel_videos (
    id uuid default uuid_generate_v4() primary key,
    channel_id uuid references public.channels(id) on delete cascade not null,
    video_url text not null,
    title text not null,
    description text,
    duration_seconds integer not null check (duration_seconds > 0),
    view_count integer default 0 not null check (view_count >= 0),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 21. playlists
-- ==========================================
create table public.playlists (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    is_private boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 22. saved_items
-- ==========================================
create table public.saved_items (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    item_type text not null, -- 'post', 'video', 'time_capsule'
    reference_id uuid not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_saved_item_type check (item_type in ('post', 'video', 'time_capsule'))
);

-- ==========================================
-- 23. search_queries
-- ==========================================
create table public.search_queries (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    query_text text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 24. trending_topics
-- ==========================================
create table public.trending_topics (
    keyword text primary key,
    weight numeric(10, 4) default 1.0000 not null,
    last_updated timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 25. random_match_sessions
-- ==========================================
create table public.random_match_sessions (
    id uuid default uuid_generate_v4() primary key,
    user_1_id uuid references public.profiles(id) on delete cascade not null,
    user_2_id uuid references public.profiles(id) on delete cascade not null,
    session_type text not null, -- 'text', 'video'
    webrtc_room_token text not null,
    started_at timestamp with time zone default timezone('utc'::text, now()) not null,
    ended_at timestamp with time zone,
    constraint check_match_type check (session_type in ('text', 'video')),
    constraint check_match_different_users check (user_1_id <> user_2_id)
);

-- ==========================================
-- 26. random_match_reports
-- ==========================================
create table public.random_match_reports (
    id uuid default uuid_generate_v4() primary key,
    session_id uuid references public.random_match_sessions(id) on delete cascade not null,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    offender_id uuid references public.profiles(id) on delete cascade not null,
    reason text not null,
    details text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_report_self check (reporter_id <> offender_id)
);

-- ==========================================
-- 27. reports
-- ==========================================
create table public.reports (
    id uuid default uuid_generate_v4() primary key,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    reported_user_id uuid references public.profiles(id) on delete cascade not null,
    content_type text not null, -- 'post', 'comment', 'message', 'video'
    reference_id uuid not null,
    reason text not null,
    status text default 'open'::text not null, -- 'open', 'reviewed', 'dismissed'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_report_status check (status in ('open', 'reviewed', 'dismissed')),
    constraint check_report_different check (reporter_id <> reported_user_id)
);

-- ==========================================
-- 28. trust_scores
-- ==========================================
create table public.trust_scores (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    ats_score integer default 50 not null check (ats_score between 0 and 100),
    ts_score integer default 50 not null check (ts_score between 0 and 100),
    n_score integer default 50 not null check (n_score between 0 and 100),
    last_recalculated timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 29. anonymous_trust_ratings
-- ==========================================
create table public.anonymous_trust_ratings (
    id uuid default uuid_generate_v4() primary key,
    target_user_id uuid references public.profiles(id) on delete cascade not null,
    rating integer not null check (rating between 1 and 5),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 30. user_blocks
-- ==========================================
create table public.user_blocks (
    blocker_id uuid references public.profiles(id) on delete cascade,
    blocked_id uuid references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (blocker_id, blocked_id),
    constraint check_not_self_block check (blocker_id <> blocked_id)
);


-- ============================================================================
-- HIGH-PERFORMANCE DATABASE INDEXES (Optimization & Fast Lookups)
-- ============================================================================

-- Search & User Lookup Index
create index idx_profiles_username_trgm on public.profiles (username);
create index idx_profiles_is_moderator on public.profiles (is_moderator) where is_moderator = true;

-- Friends and Blocking Optimization
create index idx_friend_requests_receiver_status on public.friend_requests(receiver_id, status);
create index idx_friendships_user2 on public.friendships(user_id_2);
create index idx_user_blocks_blocked on public.user_blocks(blocked_id);

-- Post & Feed Query Speedups
create index idx_posts_creator_created on public.posts (creator_id, created_at desc);
create index idx_posts_visibility on public.posts (visibility);
create index idx_post_media_post on public.post_media (post_id);
create index idx_post_comments_post_parent on public.post_comments (post_id, parent_comment_id);
create index idx_post_reactions_user on public.post_reactions(user_id);

-- Message pipeline queries
create index idx_chat_members_user on public.chat_members (user_id);
create index idx_messages_chat_created on public.messages (chat_id, created_at desc);

-- Realtime Notifications index
create index idx_notifications_recipient_unread on public.notifications (recipient_id, is_read) where is_read = false;

-- Time capsule unlock checks
create index idx_time_capsules_unlock_unlocked on public.time_capsules(unlock_at, is_unlocked) where is_unlocked = false;

-- Emergency pools timeline check
create index idx_emergency_pools_status_expires on public.emergency_pools(status, expires_at);


-- ============================================================================
-- STORAGE BUCKETS CONFIGURATION (Supabase Storage Rules)
-- ============================================================================

-- Note: The following are programmatic RLS configurations for standard Supabase 'storage' tables
-- bucket allocations: 'avatars', 'posts-media', 'channels-videos'

insert into storage.buckets (id, name, public) 
values 
('avatars', 'avatars', true),
('posts-media', 'posts-media', false),
('channels-videos', 'channels-videos', true)
on conflict (id) do nothing;

create policy "Avatars are publicly readable" on storage.objects 
    for select using (bucket_id = 'avatars');

create policy "Users can upload their own avatar" on storage.objects 
    for insert with check (bucket_id = 'avatars' and auth.uid() = owner);

create policy "Posts media is accessible by authenticated users" on storage.objects 
    for select using (bucket_id = 'posts-media' and auth.role() = 'authenticated');

create policy "Users can upload post media" on storage.objects 
    for insert with check (bucket_id = 'posts-media' and auth.role() = 'authenticated');


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Profiles
alter table public.profiles enable row level security;
create policy "Allow public profile viewing" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Settings
alter table public.user_settings enable row level security;
create policy "Users can view own settings" on public.user_settings for select using (auth.uid() = user_id);
create policy "Users can update own settings" on public.user_settings for update using (auth.uid() = user_id);

-- Posts
alter table public.posts enable row level security;
create policy "Anyone can view public posts" on public.posts for select 
    using (visibility = 'everyone');
create policy "Friends can view friend-only posts" on public.posts for select 
    using (
        visibility = 'friends' and (
            creator_id = auth.uid() or 
            exists (
                select 1 from public.friendships 
                where (user_id_1 = auth.uid() and user_id_2 = creator_id)
                   or (user_id_1 = creator_id and user_id_2 = auth.uid())
            )
        )
    );
create policy "Creator can view private posts" on public.posts for select 
    using (creator_id = auth.uid());
create policy "Users can insert their own posts" on public.posts for insert 
    with check (creator_id = auth.uid());
create policy "Creators can delete their own posts" on public.posts for delete 
    using (creator_id = auth.uid());

-- Messages
alter table public.messages enable row level security;
create policy "Only chat members can read messages" on public.messages for select 
    using (
        exists (
            select 1 from public.chat_members 
            where chat_id = messages.chat_id and user_id = auth.uid()
        )
    );
create policy "Only chat members can send messages" on public.messages for insert 
    with check (
        sender_id = auth.uid() and 
        exists (
            select 1 from public.chat_members 
            where chat_id = messages.chat_id and user_id = auth.uid()
        )
    );

-- Reports
alter table public.reports enable row level security;
create policy "Only moderators can view content reports" on public.reports for select 
    using (
        exists (
            select 1 from public.profiles 
            where id = auth.uid() and is_moderator = true
        )
    );
create policy "Authenticated users can submit reports" on public.reports for insert 
    with check (reporter_id = auth.uid());

-- Time Capsules
alter table public.time_capsules enable row level security;
create policy "Creators can view their own time capsules anytime" on public.time_capsules for select 
    using (creator_id = auth.uid());
create policy "Unlocked capsules are readable by anyone" on public.time_capsules for select 
    using (unlock_at <= now() or is_unlocked = true);
create policy "Users can insert their own time capsules" on public.time_capsules for insert 
    with check (creator_id = auth.uid());


-- ============================================================================
-- TRIGGERS & PROCEDURAL LOGIC (Automation & Updates)
-- ============================================================================

-- Automated updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger tr_profiles_updated_at before update on public.profiles
    for each row execute function public.handle_updated_at();

create trigger tr_user_settings_updated_at before update on public.user_settings
    for each row execute function public.handle_updated_at();

-- Automated profile setup after user signs up in auth.users
create or replace function public.handle_new_user()
returns trigger as $$
declare
    new_username text;
begin
    new_username := coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(md5(random()::text), 1, 8));
    
    insert into public.profiles (id, username, display_name, avatar_url, tagline)
    values (
        new.id,
        new_username,
        coalesce(new.raw_user_meta_data->>'display_name', new_username),
        coalesce(new.raw_user_meta_data->>'avatar_url', ''),
        'Welcome to Turtle!'
    );

    insert into public.user_settings (user_id)
    values (new.id);

    insert into public.trust_scores (user_id)
    values (new.id);

    return new;
end;
$$ language plpgsql security definer;

-- Trigger linked to the internal auth.users table
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- ============================================================================
-- VERIFIABLE DEMO SEED DATA EXAMPLES
-- ============================================================================

-- Pre-populating some dummy data for verification (assumes manual profiles setup)
-- In true Supabase setup, IDs link with auth.users. Here we simulate user UUIDs.

insert into public.profiles (id, username, display_name, tagline, is_moderator)
values 
('11111111-1111-1111-1111-111111111111', 'turtle_founder', 'Shelley Red', 'Architect of Turtle Network', true),
('22222222-2222-2222-2222-222222222222', 'cozy_coder', 'Alex Green', 'Building cool tools & systems', false),
('33333333-3333-3333-3333-333333333333', 'speed_racer', 'Marcus Swift', 'Asphalt simulation lover', false)
on conflict (id) do nothing;

insert into public.user_settings (user_id, allow_random_match, who_can_see_my_posts, who_can_message_me)
values 
('11111111-1111-1111-1111-111111111111', true, 'everyone', 'everyone'),
('22222222-2222-2222-2222-222222222222', true, 'friends', 'friends'),
('33333333-3333-3333-3333-333333333333', false, 'everyone', 'everyone')
on conflict (user_id) do nothing;

insert into public.trust_scores (user_id, ats_score, ts_score, n_score)
values 
('11111111-1111-1111-1111-111111111111', 95, 99, 85),
('22222222-2222-2222-2222-222222222222', 80, 85, 70),
('33333333-3333-3333-3333-333333333333', 60, 90, 50)
on conflict (user_id) do nothing;

insert into public.emergency_pools (id, creator_id, title, description, target_funding, current_funding, vote_threshold_pct, status, expires_at)
values 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Kyoto Medical Pool', 'Local funds allocation for urgent medical cases', 15000.00, 4200.00, 66, 'funding', now() + interval '30 days')
on conflict (id) do nothing;

insert into public.posts (id, creator_id, content_text, visibility)
values 
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Welcome everyone to the decentralized Turtle social ecosystem! Check your metrics cards now.', 'everyone'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Excited to show you our upcoming encrypted safety and communication plans!', 'friends')
on conflict (id) do nothing;

insert into public.time_capsules (creator_id, encrypted_content, unlock_at, is_unlocked)
values 
('11111111-1111-1111-1111-111111111111', 'U2FsdGVkX19P8wG...EncryptedMessageSecret...', now() + interval '365 days', false)
on conflict (id) do nothing;

insert into public.trending_topics (keyword, weight)
values 
('decryption', 4.8210),
('mutual_aid', 3.5110),
('trust_score', 2.9400)
on conflict (keyword) do nothing;
