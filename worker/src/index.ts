/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * MissLite CF Worker — minimal Misskey-compatible backend
 * running on Cloudflare Workers with D1 as the database.
 */

import type { Env, Handler } from './types.js';
import { cors, json, err } from './helpers.js';
import { ensureSchema } from './schema.js';
import { meta, adminAccountsCreate, signin, signinFlow, signout, signup, changePassword } from './handlers/auth.js';
import {
	currentUser, updateUser, showUser, searchUsers,
	userRelation, userStats, usersSearchByUsernameAndHost,
	userAchievements, userFeaturedNotes, usersRecommendation,
	usersReportAbuse, usersUpdateMemo, usersGetSecurityInfo,
	listUsers, usersReactions, usersGetFrequentlyRepliedUsers,
	usersGetFollowingBirthdayUsers,
} from './handlers/users.js';
import {
	createNote, showNote, showPartialBulk, deleteNote, timeline, userNotes, searchNotes,
	noteState, noteMentions, noteConversation,
	createReaction, deleteReaction, listReactions,
	createFavorite, deleteFavorite, listFavorites,
	notesChildren, notesReplies, notesRenotes, deleteRenote, searchByTag,
	threadMuteCreate, threadMuteDelete,
} from './handlers/notes.js';
import {
	suspendUser, unsuspendUser, addModerator, removeModerator, showUsers,
	createInvite, listInvites,
	deleteAccount, resetPassword, updateMeta, showModerationLogs,
	listAnnouncements, createAnnouncement, deleteAnnouncement,
	adminAnnouncementsList, adminAnnouncementsUpdate,
	adminMeta, adminShowUser,
	adminGetIndexStats, adminGetTableStats,
	adminInviteCreate, adminInviteList,
	adminRegenerateUserToken,
	adminAbuseUserReports, adminResolveAbuseUserReport,
	adminForwardAbuseUserReport, adminUpdateAbuseUserReport,
	adminShowUserAccountMoveLogs,
	adminUnsetUserAvatar, adminUnsetUserBanner,
	adminUpdateUserName, adminUpdateUserNote,
} from './handlers/admin.js';
import {
	emojis, stats, ping, serverInfo, listNotifications, markNotificationsRead,
	userListsList, iClips, iMute, iBlock, iFollowing, iFollowers,
	driveFiles, driveFolders, antennasList, iUserListMemberships,
	notesFeatured, channelsFeatured, channelsFollowed,
	flashFeatured, pagesFeatured, galleryFeatured, iGalleryLikes,
	hashtagsTrend, readAnnouncement, swRegister, swUnregister,
	iNotificationsGrouped,
	bubbleGameRanking, iClaimAchievement,
	swShowRegistration, swUpdateRegistration,
	usernameAvailable, emailAddressAvailable, getOnlineUsersCount,
	pinnedUsers, retention, emojiSingle, endpointSingle, announcementShow,
	iPin, iUnpin, iDeleteAccount, iRegenerateToken, iSigninHistory,
	iRegistryGetDetail, iRegistryKeysWithType, iRegistryScopesWithDomain,
	testEndpoint, iPurgeTimelineCache,
	notificationsCreate, notificationsFlush,
	inviteDelete, inviteLimit, getAvatarDecorations,
	bubbleGameRegister, fetchRss, fetchExternalResources,
	promoRead, resetDb, pagePush,
	requestResetPassword, resetPasswordHandler, iRevokeToken, iMove,
	hashtagsList, hashtagsSearch, hashtagsShow, hashtagsUsers,
	notesPollsVote, notesPollsRecommendation,
} from './handlers/misc.js';
import { registryGetAll, registryGet, registrySet, registryRemove, registryKeys } from './handlers/registry.js';
import {
	followCreate, followDelete, followInvalidate,
	followRequestsAccept, followRequestsCancel, followRequestsList,
	followRequestsReject, followRequestsSent,
	followUpdate, followUpdateAll,
	usersFollowers, usersFollowing,
} from './handlers/following.js';
import { blockingCreate, blockingDelete, blockingList } from './handlers/blocking.js';
import {
	muteCreate, muteDelete, muteList,
	renoteMuteCreate, renoteMuteDelete, renoteMuteList,
} from './handlers/muting.js';
import {
	clipsCreate, clipsDelete, clipsShow, clipsUpdate, clipsList,
	clipsAddNote, clipsRemoveNote, clipsNotes,
	clipsFavorite, clipsUnfavorite, clipsMyFavorites,
	iClips as iClipsFromClips, usersClips, notesClips,
} from './handlers/clips.js';
import {
	channelsCreate, channelsShow, channelsUpdate,
	channelsFollow, channelsUnfollow,
	channelsFollowed as channelsFollowedFromChannels,
	channelsFeatured as channelsFeaturedFromChannels,
	channelsFavorite, channelsUnfavorite, channelsMyFavorites,
	channelsOwned, channelsSearch, channelsTimeline,
	channelsFeaturedGames,
} from './handlers/channels.js';
import {
	antennasCreate, antennasDelete, antennasShow, antennasUpdate,
	antennasList as antennasListFromAntennas, antennasNotes,
} from './handlers/antennas.js';
import {
	pagesCreate, pagesDelete, pagesShow, pagesUpdate,
	pagesLike, pagesUnlike, iPages, iPageLikes, usersPages,
} from './handlers/pages.js';
import {
	flashCreate, flashDelete, flashShow, flashUpdate,
	flashLike, flashUnlike, flashMy, flashMyLikes,
	flashFeatured as flashFeaturedFromFlash, usersFlashs,
} from './handlers/flash.js';
import {
	galleryPosts, galleryPostsCreate, galleryPostsDelete,
	galleryPostsShow, galleryPostsUpdate,
	galleryPostsLike, galleryPostsUnlike,
	galleryPopular,
	galleryFeatured as galleryFeaturedFromGallery,
	iGalleryPosts,
	iGalleryLikes as iGalleryLikesFromGallery,
	usersGalleryPosts,
} from './handlers/gallery.js';
import {
	rolesList, rolesShow, rolesNotes, rolesUsers,
	adminRolesCreate, adminRolesDelete, adminRolesList, adminRolesShow,
	adminRolesUpdate, adminRolesAssign, adminRolesUnassign, adminRolesUsers,
	adminRolesUpdateDefaultPolicies, adminRolesUpdateInlinePolicies,
} from './handlers/roles.js';
import {
	userListsCreate, userListsDelete, userListsShow, userListsUpdate,
	userListsList as userListsListFromUL, userListsPush, userListsPull,
	userListsGetMemberships, userListsCreateFromPublic,
	userListsFavorite, userListsUnfavorite, userListsUpdateMembership,
	iUserListMemberships as iUserListMembershipsFromUL,
	notesUserListTimeline,
} from './handlers/user-lists.js';
import { stubRoutes } from './handlers/stubs.js';

const routes: Record<string, Handler> = {
	// Instance
	'meta': meta,
	'ping': ping,
	'stats': stats,
	'emojis': emojis,
	'server-info': serverInfo,
	'announcements': listAnnouncements,

	// Auth
	'admin/accounts/create': adminAccountsCreate,
	'signin': signin,
	'signin-flow': signinFlow,
	'signout': signout,
	'signup': signup,
	'i/change-password': changePassword,

	// Users
	'i': currentUser,
	'i/update': updateUser,
	'users/show': showUser,
	'users/search': searchUsers,

	// Notes
	'notes/create': createNote,
	'notes/show': showNote,
	'notes/show-partial-bulk': showPartialBulk,
	'notes/delete': deleteNote,
	'notes/timeline': timeline,
	'notes/local-timeline': timeline,
	'notes/hybrid-timeline': timeline,
	'notes/global-timeline': timeline,
	'users/notes': userNotes,
	'notes/search': searchNotes,
	'notes/state': noteState,
	'notes/mentions': noteMentions,
	'notes/conversation': noteConversation,

	// Reactions
	'notes/reactions/create': createReaction,
	'notes/reactions/delete': deleteReaction,
	'notes/reactions': listReactions,

	// Favorites
	'notes/favorites/create': createFavorite,
	'notes/favorites/delete': deleteFavorite,
	'i/favorites': listFavorites,

	// Notifications
	'i/notifications': listNotifications,
	'i/notifications-grouped': iNotificationsGrouped,
	'notifications/mark-all-as-read': markNotificationsRead,

	// Admin / Moderation
	'admin/suspend-user': suspendUser,
	'admin/unsuspend-user': unsuspendUser,
	'admin/moderators/add': addModerator,
	'admin/moderators/remove': removeModerator,
	'admin/show-users': showUsers,
	'admin/delete-account': deleteAccount,
	'admin/reset-password': resetPassword,
	'admin/update-meta': updateMeta,
	'admin/show-moderation-logs': showModerationLogs,
	'admin/announcements/create': createAnnouncement,
	'admin/announcements/delete': deleteAnnouncement,
	'admin/announcements/list': adminAnnouncementsList,
	'admin/announcements/update': adminAnnouncementsUpdate,
	'admin/meta': adminMeta,
	'admin/show-user': adminShowUser,
	'admin/get-index-stats': adminGetIndexStats,
	'admin/get-table-stats': adminGetTableStats,
	'admin/invite/create': adminInviteCreate,
	'admin/invite/list': adminInviteList,
	'admin/regenerate-user-token': adminRegenerateUserToken,
	'admin/abuse-user-reports': adminAbuseUserReports,
	'admin/resolve-abuse-user-report': adminResolveAbuseUserReport,
	'admin/forward-abuse-user-report': adminForwardAbuseUserReport,
	'admin/update-abuse-user-report': adminUpdateAbuseUserReport,
	'admin/show-user-account-move-logs': adminShowUserAccountMoveLogs,
	'admin/unset-user-avatar': adminUnsetUserAvatar,
	'admin/unset-user-banner': adminUnsetUserBanner,
	'admin/update-user-name': adminUpdateUserName,
	'admin/update-user-note': adminUpdateUserNote,

	// Invites
	'invite/create': createInvite,
	'invite/list': listInvites,

	'endpoints': async () => json(Object.keys(routes)),

	// Registry (user preferences / frontend settings store)
	'i/registry/get-all': registryGetAll,
	'i/registry/get': registryGet,
	'i/registry/set': registrySet,
	'i/registry/remove': registryRemove,
	'i/registry/keys': registryKeys,

	// Service Worker
	'sw/register': swRegister,
	'sw/unregister': swUnregister,
	'sw/show-registration': swShowRegistration,
	'sw/update-registration': swUpdateRegistration,

	// Various endpoints from misc.ts
	'notes/featured': notesFeatured,
	'hashtags/trend': hashtagsTrend,
	'hashtags/list': hashtagsList,
	'hashtags/search': hashtagsSearch,
	'hashtags/show': hashtagsShow,
	'hashtags/users': hashtagsUsers,
	'notes/polls/vote': notesPollsVote,
	'notes/polls/recommendation': notesPollsRecommendation,
	'i/read-announcement': readAnnouncement,
	'drive/files': driveFiles,
	'drive/folders': driveFolders,
	'i/following': iFollowing,
	'i/followers': iFollowers,
	'i/mute': iMute,
	'i/block': iBlock,
	'bubble-game/ranking': bubbleGameRanking,
	'bubble-game/register': bubbleGameRegister,
	'i/claim-achievement': iClaimAchievement,

	// Misc endpoints implemented in misc.ts
	'username/available': usernameAvailable,
	'email-address/available': emailAddressAvailable,
	'get-online-users-count': getOnlineUsersCount,
	'pinned-users': pinnedUsers,
	'retention': retention,
	'emoji': emojiSingle,
	'endpoint': endpointSingle,
	'announcements/show': announcementShow,
	'announcement': announcementShow,
	'i/pin': iPin,
	'i/unpin': iUnpin,
	'i/delete-account': iDeleteAccount,
	'i/regenerate-token': iRegenerateToken,
	'i/signin-history': iSigninHistory,
	'i/registry/get-detail': iRegistryGetDetail,
	'i/registry/keys-with-type': iRegistryKeysWithType,
	'i/registry/scopes-with-domain': iRegistryScopesWithDomain,
	'i/revoke-token': iRevokeToken,
	'i/move': iMove,
	'i/purge-timeline-cache': iPurgeTimelineCache,
	'test': testEndpoint,
	'notifications/create': notificationsCreate,
	'notifications/flush': notificationsFlush,
	'invite/delete': inviteDelete,
	'invite/limit': inviteLimit,
	'get-avatar-decorations': getAvatarDecorations,
	'fetch-rss': fetchRss,
	'fetch-external-resources': fetchExternalResources,
	'promo/read': promoRead,
	'reset-db': resetDb,
	'page-push': pagePush,
	'request-reset-password': requestResetPassword,
	'reset-password': resetPasswordHandler,

	// Following
	'following/create': followCreate,
	'following/delete': followDelete,
	'following/invalidate': followInvalidate,
	'following/requests/accept': followRequestsAccept,
	'following/requests/cancel': followRequestsCancel,
	'following/requests/list': followRequestsList,
	'following/requests/reject': followRequestsReject,
	'following/requests/sent': followRequestsSent,
	'following/update': followUpdate,
	'following/update-all': followUpdateAll,
	'users/followers': usersFollowers,
	'users/following': usersFollowing,

	// Blocking
	'blocking/create': blockingCreate,
	'blocking/delete': blockingDelete,
	'blocking/list': blockingList,

	// Muting
	'mute/create': muteCreate,
	'mute/delete': muteDelete,
	'mute/list': muteList,
	'renote-mute/create': renoteMuteCreate,
	'renote-mute/delete': renoteMuteDelete,
	'renote-mute/list': renoteMuteList,

	// Clips
	'clips/create': clipsCreate,
	'clips/delete': clipsDelete,
	'clips/show': clipsShow,
	'clips/update': clipsUpdate,
	'clips/list': clipsList,
	'clips/add-note': clipsAddNote,
	'clips/remove-note': clipsRemoveNote,
	'clips/notes': clipsNotes,
	'clips/favorite': clipsFavorite,
	'clips/unfavorite': clipsUnfavorite,
	'clips/my-favorites': clipsMyFavorites,
	'i/clips': iClipsFromClips,
	'users/clips': usersClips,
	'notes/clips': notesClips,

	// Channels
	'channels/create': channelsCreate,
	'channels/show': channelsShow,
	'channels/update': channelsUpdate,
	'channels/follow': channelsFollow,
	'channels/unfollow': channelsUnfollow,
	'channels/followed': channelsFollowedFromChannels,
	'channels/featured': channelsFeaturedFromChannels,
	'channels/favorite': channelsFavorite,
	'channels/unfavorite': channelsUnfavorite,
	'channels/my-favorites': channelsMyFavorites,
	'channels/owned': channelsOwned,
	'channels/search': channelsSearch,
	'channels/timeline': channelsTimeline,
	'channels/featured-games': channelsFeaturedGames,

	// Antennas
	'antennas/create': antennasCreate,
	'antennas/delete': antennasDelete,
	'antennas/show': antennasShow,
	'antennas/update': antennasUpdate,
	'antennas/list': antennasListFromAntennas,
	'antennas/notes': antennasNotes,

	// Pages
	'pages/create': pagesCreate,
	'pages/delete': pagesDelete,
	'pages/show': pagesShow,
	'pages/update': pagesUpdate,
	'pages/like': pagesLike,
	'pages/unlike': pagesUnlike,
	'i/pages': iPages,
	'i/page-likes': iPageLikes,
	'users/pages': usersPages,

	// Flash
	'flash/create': flashCreate,
	'flash/delete': flashDelete,
	'flash/show': flashShow,
	'flash/update': flashUpdate,
	'flash/like': flashLike,
	'flash/unlike': flashUnlike,
	'flash/my': flashMy,
	'flash/my-likes': flashMyLikes,
	'flash/featured': flashFeaturedFromFlash,
	'users/flashs': usersFlashs,

	// Gallery
	'gallery/posts': galleryPosts,
	'gallery/posts/create': galleryPostsCreate,
	'gallery/posts/delete': galleryPostsDelete,
	'gallery/posts/show': galleryPostsShow,
	'gallery/posts/update': galleryPostsUpdate,
	'gallery/posts/like': galleryPostsLike,
	'gallery/posts/unlike': galleryPostsUnlike,
	'gallery/popular': galleryPopular,
	'gallery/featured': galleryFeaturedFromGallery,
	'i/gallery/posts': iGalleryPosts,
	'i/gallery/likes': iGalleryLikesFromGallery,
	'users/gallery/posts': usersGalleryPosts,

	// User Lists
	'users/lists/create': userListsCreate,
	'users/lists/delete': userListsDelete,
	'users/lists/show': userListsShow,
	'users/lists/update': userListsUpdate,
	'users/lists/list': userListsListFromUL,
	'users/lists/push': userListsPush,
	'users/lists/pull': userListsPull,
	'users/lists/get-memberships': userListsGetMemberships,
	'users/lists/create-from-public': userListsCreateFromPublic,
	'users/lists/favorite': userListsFavorite,
	'users/lists/unfavorite': userListsUnfavorite,
	'users/lists/update-membership': userListsUpdateMembership,
	'i/user-list-memberships': iUserListMembershipsFromUL,
	'notes/user-list-timeline': notesUserListTimeline,

	// Notes (additional)
	'notes/children': notesChildren,
	'notes/replies': notesReplies,
	'notes/renotes': notesRenotes,
	'notes/unrenote': deleteRenote,
	'notes/search-by-tag': searchByTag,
	'notes/thread-muting/create': threadMuteCreate,
	'notes/thread-muting/delete': threadMuteDelete,

	// Roles
	'admin/roles/create': adminRolesCreate,
	'admin/roles/delete': adminRolesDelete,
	'admin/roles/list': adminRolesList,
	'admin/roles/show': adminRolesShow,
	'admin/roles/update': adminRolesUpdate,
	'admin/roles/assign': adminRolesAssign,
	'admin/roles/unassign': adminRolesUnassign,
	'admin/roles/users': adminRolesUsers,
	'admin/roles/update-default-policies': adminRolesUpdateDefaultPolicies,
	'admin/roles/update-inline-policies': adminRolesUpdateInlinePolicies,
	'roles/list': rolesList,
	'roles/show': rolesShow,
	'roles/notes': rolesNotes,
	'roles/users': rolesUsers,

	// Users (additional)
	'users/relation': userRelation,
	'users/stats': userStats,
	'users/search-by-username-and-host': usersSearchByUsernameAndHost,
	'users/achievements': userAchievements,
	'users/featured-notes': userFeaturedNotes,
	'users/recommendation': usersRecommendation,
	'users/report-abuse': usersReportAbuse,
	'users/update-memo': usersUpdateMemo,
	'users/get-security-info': usersGetSecurityInfo,
	'users': listUsers,
	'users/reactions': usersReactions,
	'users/get-frequently-replied-users': usersGetFrequentlyRepliedUsers,
	'users/get-following-birthday-users': usersGetFollowingBirthdayUsers,

	'pages/featured': pagesFeatured,

	// Stubs — auto-generated from api.json for all unimplemented endpoints
	...stubRoutes,
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors() });
		}

		const url = new URL(request.url);

		// .well-known/nodeinfo — federation discovery stub
		if (url.pathname === '/.well-known/nodeinfo') {
			return json({
				links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${url.origin}/nodeinfo/2.1` }],
			});
		}
		if (url.pathname === '/nodeinfo/2.1') {
			const initialized = await env.DB.prepare("SELECT value FROM meta WHERE key = 'initialized'").first<{ value: string }>().catch(() => null);
			const users = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>().catch(() => ({ c: 0 }));
			const notes = await env.DB.prepare('SELECT COUNT(*) as c FROM notes').first<{ c: number }>().catch(() => ({ c: 0 }));
			return json({
				version: '2.1',
				software: { name: 'misslite', version: '2026.3.0' },
				protocols: ['misskey'],
				usage: { users: { total: users?.c ?? 0 }, localPosts: notes?.c ?? 0 },
				openRegistrations: !initialized,
			});
		}

		const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

		if (!path || path === '') {
			return json({ name: 'MissLite CF', version: '0.1.0' });
		}

		const handler = routes[path];
		if (!handler) {
			return err('Unknown endpoint: ' + path, 404);
		}

		let body: Record<string, unknown> = {};
		if (request.method === 'POST') {
			try {
				body = await request.json() as Record<string, unknown>;
			} catch {
				body = {};
			}
		}

		try {
			await ensureSchema(env.DB);
			return await handler(env.DB, body, env);
		} catch (e) {
			console.error('Handler error:', e);
			return err('Internal server error', 500);
		}
	},
};

export type { Env };
