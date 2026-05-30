import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { GatherHubProvider } from "@/lib/gatherhub";
import { AppLayout } from "@/components/layout/AppLayout";
import SignInPage from "@/pages/auth/SignInPage";
import SignUpPage from "@/pages/auth/SignUpPage";
import AcceptInvitePage from "@/pages/auth/AcceptInvitePage";
import ProfilePage from "@/pages/auth/ProfilePage";

import DashboardPage from "@/pages/DashboardPage";
import MembersPage from "@/pages/members/MembersPage";
import MemberDetailPage from "@/pages/members/MemberDetailPage";
import TeamsPage from "@/pages/teams/TeamsPage";
import TeamDetailPage from "@/pages/teams/TeamDetailPage";
import EventsPage from "@/pages/events/EventsPage";
import EventDetailPage from "@/pages/events/EventDetailPage";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import AssetsPage from "@/pages/assets/AssetsPage";
import AssetDetailPage from "@/pages/assets/AssetDetailPage";
import AssetHistoryPage from "@/pages/assets/HistoryPage";
import QrSheetPage from "@/pages/assets/QrSheetPage";
import VolunteersPage from "@/pages/VolunteersPage";
import SponsorsPage from "@/pages/sponsors/SponsorsPage";
import SponsorDetailPage from "@/pages/sponsors/SponsorDetailPage";
import NewsAdminPage from "@/pages/NewsAdminPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import RegistrationsPage from "@/pages/soccer/RegistrationsPage";
import GradingPage, { PlayerEvaluationPage } from "@/pages/soccer/GradingPage";
import SoccerPlayersPage from "@/pages/soccer/PlayersPage";
import SoccerDivisionsPage from "@/pages/soccer/DivisionsPage";
import CoachesManagersPage from "@/pages/soccer/CoachesManagersPage";
import CompetitionsPage from "@/pages/soccer/CompetitionsPage";
import AgeGroupsPage from "@/pages/soccer/AgeGroupsPage";
import LifetimeMembersPage from "@/pages/members/LifetimeMembersPage";
import AuditLogsPage from "@/pages/settings/AuditLogsPage";
import NotFoundPage from "@/pages/NotFoundPage";

import PublicAssetPage from "@/pages/public/PublicAssetPage";
import PublicSitePage from "@/pages/public/PublicSitePage";
import PublicNewsPage from "@/pages/public/PublicNewsPage";

export default function App() {
  return (
    <Routes>
      {/* Public, unauthenticated routes */}
      <Route path="/a/:tagId" element={<PublicAssetPage />} />
      <Route path="/club/:slug" element={<PublicSitePage />} />
      <Route
        path="/club/:slug/news/:articleSlug"
        element={<PublicNewsPage />}
      />

      {/* Clerk auth routes — wildcard so Clerk's sub-routes (verify, sso, etc.) work */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Org invitation acceptance — works signed in or out */}
      <Route path="/invite/:code" element={<AcceptInvitePage />} />

      {/* Authenticated app */}
      <Route path="/*" element={<AuthedApp />} />
    </Routes>
  );
}

function AuthedApp() {
  return (
    <>
      <SignedIn>
        <GatherHubProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/members" element={<MembersPage />} />
              <Route path="/members/:memberId" element={<MemberDetailPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/teams/:teamId" element={<TeamDetailPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:eventId" element={<EventDetailPage />} />
              <Route path="/announcements" element={<AnnouncementsPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/assets/history" element={<AssetHistoryPage />} />
              {/* Old scan route redirects to history; web app does not scan. */}
              <Route
                path="/assets/scan"
                element={<Navigate to="/assets/history" replace />}
              />
              <Route path="/assets/qr-sheet" element={<QrSheetPage />} />
              <Route path="/assets/:assetId" element={<AssetDetailPage />} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/sponsors" element={<SponsorsPage />} />
              <Route
                path="/sponsors/:sponsorId"
                element={<SponsorDetailPage />}
              />
              <Route path="/news" element={<NewsAdminPage />} />
              <Route path="/soccer/players" element={<SoccerPlayersPage />} />
              <Route
                path="/soccer/registrations"
                element={<RegistrationsPage />}
              />
              <Route
                path="/soccer/divisions"
                element={<SoccerDivisionsPage />}
              />
              <Route path="/soccer/grading" element={<GradingPage />} />
              <Route
                path="/soccer/grading/:memberId"
                element={<PlayerEvaluationPage />}
              />
              <Route
                path="/soccer/coaches-managers"
                element={<CoachesManagersPage />}
              />
              <Route
                path="/soccer/competitions"
                element={<CompetitionsPage />}
              />
              <Route path="/soccer/age-groups" element={<AgeGroupsPage />} />
              <Route
                path="/lifetime-members"
                element={<LifetimeMembersPage />}
              />
              <Route path="/settings/audit-logs" element={<AuditLogsPage />} />
              {/* Redirects from the pre-namespace routes. */}
              <Route
                path="/registrations"
                element={<Navigate to="/soccer/registrations" replace />}
              />
              <Route
                path="/grading"
                element={<Navigate to="/soccer/grading" replace />}
              />
              <Route
                path="/grading/:memberId"
                element={<Navigate to="/soccer/grading" replace />}
              />
              <Route path="/profile/*" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppLayout>
        </GatherHubProvider>
      </SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}
