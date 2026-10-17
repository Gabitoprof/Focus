import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { GOAL_TAGS } from "@/domain/catalog";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getCatalogSettings, getProfileTags, listAreas, searchCatalogTopics } from "@/server/services/catalog";
import { getProfile } from "@/server/services/profile";
import { PasswordForm, ProfileForm } from "./forms";
import { FriendsCard } from "@/components/friends-card";
import { listFriends } from "@/server/services/friends";
import { TagsForm } from "./tags-form";
import { InstitutionPanel } from "@/components/institution-panel";
import { loadInstitutionPanel } from "../institution-data";
import { SignOutButton } from "../sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.profile };
}

export default async function ProfilePage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.profile.title} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requireUser();
  const ctx = await appCtx();
  const { t } = await getI18n();
  const [profile, tags, areas, catalog, settings, institutionPanel, friends] = await Promise.all([
    getProfile(ctx, user.id),
    getProfileTags(ctx, user.id),
    listAreas(ctx),
    searchCatalogTopics(ctx),
    getCatalogSettings(ctx.db),
    loadInstitutionPanel(ctx, user.id),
    listFriends(ctx, user.id),
  ]);
  return (
    <div className="grid max-w-3xl gap-6">
      <ProfileForm displayName={profile.displayName} timezone={profile.timezone} email={user.email} />
      <TagsForm
        areas={areas.map((a) => ({ ...a, name: t.areas[a.id] ?? a.name }))}
        catalog={catalog}
        goals={GOAL_TAGS.map((g) => ({ ...g, label: t.goals[g.id] ?? g.label }))}
        initial={{
          areaIds: tags.areas.map((a) => a.id),
          topicIds: tags.topics.map((t) => t.id),
          goalIds: tags.goals.map((g) => g.id),
        }}
        limits={{ areas: settings.maxInterestAreas, topics: settings.maxFollowedTopics, goals: settings.maxGoalTags }}
      />
      <InstitutionPanel {...institutionPanel} />
      <FriendsCard {...friends} />
      <PasswordForm />
      <div className="md:hidden">
        <SignOutButton />
      </div>
    </div>
  );
}
