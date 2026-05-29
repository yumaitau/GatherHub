import { Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { GatherHubProvider } from "@/lib/gatherhub";
import { AppLayout } from "@/components/layout/AppLayout";

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
import ScanPage from "@/pages/assets/ScanPage";
import VolunteersPage from "@/pages/VolunteersPage";
import SponsorsPage from "@/pages/sponsors/SponsorsPage";
import SponsorDetailPage from "@/pages/sponsors/SponsorDetailPage";
import NewsAdminPage from "@/pages/NewsAdminPage";
import SettingsPage from "@/pages/settings/SettingsPage";
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
              <Route path="/assets/scan" element={<ScanPage />} />
              <Route path="/assets/:assetId" element={<AssetDetailPage />} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/sponsors" element={<SponsorsPage />} />
              <Route
                path="/sponsors/:sponsorId"
                element={<SponsorDetailPage />}
              />
              <Route path="/news" element={<NewsAdminPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppLayout>
        </GatherHubProvider>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
