<script setup lang="ts">
import type { Auth } from 'firebase/auth';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDoc, doc, query, getDocs } from 'firebase/firestore';
import { getMetadata, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useUserStore } from './store/currentUser';
import { useDarkModeStore } from './store/darkMode';
import { User } from './utils/User';

const { setUser } = useUserStore();
const { isDark } = storeToRefs(useDarkModeStore());
const db = useFirestore();
const searchValue = ref('');
const router = useRouter();
const index = ref<Array<Object>>([]);
let remoteJSONFound = false;
let localJSONFound = false;
let localJSONTooOld = false;
const remoteIndexLoaded = ref<boolean | undefined>(undefined);
const storage = useFirebaseStorage();
const jsonRef = storageRef(storage, 'index.json');

let auth: Auth;

const fetchRemoteJson = async () => {
  console.debug('Starting fetch...');
  const requestOptions = {
    method: 'GET',
    headers: new Headers({}),
  };
  console.debug('Getting URL...');
  const url = await new Promise((resolve, reject) => {
    const storageUrl = useStorageFileUrl(jsonRef);
    storageUrl
      .refresh()
      .then(() => {
        resolve(storageUrl.url.value);
      })
      .catch(reject);
  });
  if (url) {
    const request = new Request(url, requestOptions);
    console.debug('Requesting JSON...');
    const response = await fetch(request);
    console.debug('Parsing JSON...');
    const json = await response.json();
    return json;
  }
};

const updateRemoteIndex = async () => {
  console.debug('Starting upload...');
  const json = JSON.stringify(index.value);
  const storage = useFirebaseStorage();
  const jsonRef = storageRef(storage, 'index.json');
  const blob = new Blob([json], { type: 'application/json' });
  await uploadBytes(jsonRef, blob);
  console.debug('Upload complete.');
};

const updateRatingToIndex = (releaseID: string, newRating: number) => {
  for (const item of index.value) {
    if (item.reference.replace('releases/', '') === releaseID) {
      item.rating = newRating;
    }
  }
  updateRemoteIndex();
  localStorage.setItem('index', JSON.stringify(index.value));
};

const updateUserToIndex = (
  userID: string,
  newFields: { [key: string]: any }
) => {
  for (const item of index.value) {
    if (
      item.type === 'user' &&
      item.reference.replace('users/', '') === userID
    ) {
      for (const key in newFields) {
        if (newFields.hasOwnProperty(key)) {
          item[key] = newFields[key];
        }
      }
    }
  }
  updateRemoteIndex();
  localStorage.setItem('index', JSON.stringify(index.value));
};

const addUserToIndex = (newUser: User) => {
  index.value.push({
    name: newUser.username,
    type: 'user',
    reference: 'users/' + newUser.uid,
    picture: newUser.picture,
  });
  updateRemoteIndex();
  localStorage.setItem('index', JSON.stringify(index.value));
};

const resolveJson = async () => {
  try {
    await getMetadata(jsonRef);
    remoteJSONFound = true;
  } catch (error) {
    console.log('Remote JSON not found.');
    remoteJSONFound = false;
  }
  const localLastUpdate = localStorage.getItem('lastUpdate');
  if (localLastUpdate) {
    const timeDiff = new Date().getTime() - new Date(localLastUpdate).getTime();
    const minutesAgo = Math.floor(timeDiff / (1000 * 60));
    if (minutesAgo > 5) {
      console.debug('Local JSON found, but too old');
      localJSONTooOld = true;
      localJSONFound = true;
    } else {
      console.debug('Local JSON found and new.');
      localJSONFound = true;
      localJSONTooOld = false;
    }
  } else {
    console.debug('Didnt find index in local storage.');
    localJSONFound = false;
    localJSONTooOld = true;
  }

  if (!remoteJSONFound) {
    console.log('Building a remote index...');
    await buildRemoteIndex();
    remoteIndexLoaded.value = true;
    console.log('Uploading JSON...');
    await updateRemoteIndex();
    console.log('Index done by R1.');
  } else if (!localJSONFound || localJSONTooOld) {
    console.debug('Getting JSON from remote...');
    index.value = await fetchRemoteJson();
    remoteIndexLoaded.value = true;
    console.debug('Saving JSON locally...');
    localStorage.setItem('index', JSON.stringify(index.value));
    localStorage.setItem(
      'lastUpdate',
      JSON.stringify(new Date().toISOString())
    );
    console.debug('Index done by R3.');
  } else {
    index.value = JSON.parse(localStorage.getItem('index'));
    remoteIndexLoaded.value = true;
    console.log('Index done by R4.');
  }
};

const buildRemoteIndex = async () => {
  const releases = await getDocs(query(collection(db, 'releases')));
  const artists = await getDocs(query(collection(db, 'artists')));
  const users = await getDocs(query(collection(db, 'users')));
  index.value = [];

  await Promise.all(
    releases.docs.map(async (release) => {
      const releaseData = release.data();
      if (releaseData.artist) {
        const artistRef = releaseData.artist;
        const artistDoc = await getDoc(artistRef);
        if (artistDoc.exists()) {
          releaseData.artistName = artistDoc.data().name;
        }
      }
      index.value.push({
        name: releaseData.name,
        relevance: releaseData.relevance,
        rating: releaseData.rating,
        artist: releaseData.artist ? releaseData.artist.id : 'undefined',
        artistName: releaseData.artistName,
        cover: releaseData.cover,
        year: releaseData.date?.toDate()?.getFullYear(),
        type: releaseData.type || 'release',
        genres: releaseData.genres,
        reference: `releases/${release.id}`,
      });
    })
  );
  await Promise.all(
    artists.docs.map((artist) => {
      const artistData = artist.data();
      index.value.push({
        name: artistData.name,
        picture: artistData.picture,
        type: 'artist',
        reference: `artists/${artist.id}`,
      });
    })
  );

  await Promise.all(
    users.docs.map((user) => {
      const userData = user.data();
      index.value.push({
        name: userData.username,
        picture: userData.picture,
        type: 'user',
        reference: `users/${user.id}`,
      });
    })
  );

  console.debug('Saving JSON locally...');
  localStorage.setItem('index', JSON.stringify(index.value));
  localStorage.setItem('lastUpdate', JSON.stringify(new Date().toISOString()));
  console.debug('Done!');
};

onMounted(() => {
  initializeTheme();
  if (document.documentElement.getAttribute('data-theme') == 'dark') {
    isDark.value = true;
  }
  resolveJson();
  auth = getAuth();
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const newUser = new User(
        await getDoc(doc(collection(db, 'users'), user.uid))
      );
      await newUser.resolve(db);
      setUser(newUser);
    } else {
      setUser(null);
    }
  });
});

watch(
  () => searchValue.value,
  () => {
    router.push({
      path: '/',
      query: { search: encodeURIComponent(searchValue.value) },
    });
  }
);

const handleSignOut = async () => {
  signOut(auth);
};

const toggleDarkMode = async () => {
  if (!isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    isDark.value = true;
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
    isDark.value = false;
  }
};
</script>

<template>
  <Title>Resonar</Title>
  <button class="dark-mode-toggle" @click="toggleDarkMode">
    <i v-if="isDark" class="dm-icon material-icons">dark_mode</i>
    <i v-else class="dm-icon material-icons">light_mode</i>
  </button>
  <div class="header-fixed">
    <div class="wrapper">
      <TopBar
        v-model:search-value="searchValue"
        :handleSignOut="handleSignOut"
        :remoteIndexLoaded="remoteIndexLoaded"
      />
      <NuxtPage
        v-model:searchValue="searchValue"
        :index="index"
        :remoteIndexLoaded="remoteIndexLoaded"
        :addUserToIndex="addUserToIndex"
        :updateRatingToIndex="updateRatingToIndex"
        :updateUserToIndex="updateUserToIndex"
      ></NuxtPage>
    </div>
  </div>
</template>

<style scoped>
.dark-mode-toggle {
  width: 50px;
  height: 50px;
  @media (max-width: 550px) {
    width: 75px;
    height: 75px;
  }
  border-top-right-radius: 100%;
  position: fixed;
  bottom: 0;
  left: 0;
  cursor: pointer;
  z-index: 999;
  background-color: rgba(100, 100, 100, 0.3);
  color: white;
  border: none;
  transition: all 0.3s ease-in-out;
}

.dark-mode-toggle:hover {
  width: 55px;
  height: 55px;
  @media (max-width: 550px) {
    width: 80px;
    height: 80px;
  }
  background-color: rgba(2, 2, 2, 0.7);
}

.dm-icon {
  position: absolute;
  top: 60%;
  left: 40%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  @media (max-width: 550px) {
    font-size: 27px;
    top: 55%;
    left: 45%;
  }
}

body {
  margin: auto;
  font-weight: 300;
  background: white;
  color: var(--primary);
  line-height: 200%;
}
.header-fixed {
  margin: auto;
  color: var(--primary);
  display: block;
}

.wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  box-sizing: inherit;
  [data-theme='dark'] {
    background: black;
  }
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
}

[data-theme='dark'] .wrapper {
  background: rgb(36, 36, 36);
  color: white !important;
}
[data-theme='dark'] .rating-container {
  color: white !important;
  border-color: white !important;
}

[data-theme='dark'] .release-info-wrapper {
  color: white !important;
}

[data-theme='dark'] .search-bar-field {
  background-color: rgb(50, 62, 71);
}

[data-theme='dark'] a {
  color: white !important;
}

[data-theme='dark'] svg {
  fill: white !important;
}

[data-theme='dark'] input {
  color: white !important;
}

[data-theme='dark'] input::placeholder {
  color: white !important;
  opacity: 0.5;
}

[data-theme='dark'] .topbar-button {
  background-color: rgb(255, 255, 255);
  color: black;
  fill: black;
}

[data-theme='dark'] .filter-overlay {
  background-color: black;
  color: rgb(192, 192, 192) !important;
}

[data-theme='dark'] .topbar-button i {
  color: black !important;
}

[data-theme='dark'] .release-wrapper {
  color: white;
}

[data-theme='dark'] .score {
  color: white;
  border: 2px solid white !important;
}

[data-theme='dark'] .tracklist-container {
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
  border: 1px solid white !important;
}

[data-theme='dark'] .header-logo-sm-container {
  background-color: rgb(22, 22, 22) !important;
}

[data-theme='dark'] .user-rating-button {
  border: 2px solid white !important;
  color: white !important;
}

[data-theme='dark'] .user-rating-button:hover {
  color: black !important;
  background-color: white !important;
}

[data-theme='dark'] .user-rating-button:hover .user-rating-delete-icon {
  color: black !important;
}

[data-theme='dark'] .user-rating-button:before {
  border: none !important;
}

[data-theme='dark'] .add-rating-button {
  border: 2px solid white !important;
  color: white !important;
}

[data-theme='dark'] .add-rating-button:hover {
  color: black !important;
  background-color: white !important;
  fill: white !important;
}

[data-theme='dark'] .menu-button {
  background-color: white !important;
  color: black !important;
}

[data-theme='dark'] .menu-button-sm {
  background-color: white !important;
  color: black !important;
}

[data-theme='dark'] .menu-button-sm:hover {
  background-color: white !important;
  color: black !important;
}

.secondary-button {
  background: transparent !important;
  color: black !important;
  border: 1px solid black !important;
}

[data-theme='dark'] .secondary-button {
  background: transparent !important;
  color: white !important;
  border: 2px solid white !important;
}
[data-theme='dark'] .secondary-button:hover {
  background: white !important;
  color: black !important;
  border: 2px solid white !important;
}

[data-theme='dark'] .comment-card,
[data-theme='dark'] .rating-card,
[data-theme='dark'] .comment-area {
  background-color: rgb(36, 36, 48) !important;
  border: 1px solid white !important;
}
[data-theme='dark'] .comment-card:hover,
[data-theme='dark'] .rating-card:hover {
  background-color: rgb(58, 58, 66) !important;
}

[data-theme='dark'] .rating-card-score,
[data-theme='dark'] .rating-card-score-sm {
  border: 2px solid white !important;
}
[data-theme='dark'] .comment-score {
  border: 1px solid white !important;
}

[data-theme='dark'] .add-comment-container {
  background-color: rgb(36, 36, 48) !important;
  border: 1px solid white !important;
}

[data-theme='dark'] .add-comment-input {
  background-color: rgb(36, 36, 48) !important;
  color: white !important;
}

[data-theme='dark'] .add-comment-input::placeholder {
  color: white !important;
  opacity: 0.5;
}

[data-theme='dark'] .add-comment-button {
  color: white !important;
  border: 1px solid white !important;
}

[data-theme='dark'] .profile-wrapper {
  color: white !important;
}

[data-theme='dark'] .profile-wrapper-sm {
  color: white !important;
}

[data-theme='dark'] header {
  color: white !important;
  background-color: rgb(22, 22, 22) !important;
}

[data-theme='dark'] .p-inputtext {
  background-color: transparent !important;
}

[data-theme='dark'] .login-button {
  background-color: white !important;
  border: none !important;
  color: black !important;
}

[data-theme='dark'] .login-button:hover {
  background-color: transparent !important;
  color: white !important;
  outline: 2px solid white !important;
}
[data-theme='dark'] .topbar-login-button {
  background-color: white !important;
  color: black !important;
}

[data-theme='dark'] .topbar-login-button:hover {
  background-color: transparent !important;
  color: white !important;
  border: 1px solid white;
}

.show-bigger-than-lg-flex {
  display: none;
  @media (min-width: 1101px) {
    display: flex;
  }
}

.show-bigger-than-lg-block {
  display: none;
  @media (min-width: 1101px) {
    display: block;
  }
}

.show-smaller-than-lg-flex {
  display: none;
  @media (max-width: 1100px) {
    display: flex;
  }
}

.show-smaller-than-lg-block {
  display: none;
  @media (max-width: 1100px) {
    display: block;
  }
}

.show-bigger-than-md-flex {
  display: none;
  @media (min-width: 769px) {
    display: flex;
  }
}

.show-bigger-than-md-block {
  display: none;
  @media (min-width: 769px) {
    display: block;
  }
}

.show-smaller-than-md-flex {
  display: none;
  @media (max-width: 768px) {
    display: flex;
  }
}

.show-smaller-than-md-block {
  display: none;
  @media (max-width: 768px) {
    display: block;
  }
}

.show-bigger-than-sm-flex {
  display: none;
  @media (min-width: 501px) {
    display: flex;
  }
}

.show-bigger-than-sm-block {
  display: none;
  @media (min-width: 501px) {
    display: block;
  }
}

.show-smaller-than-sm-flex {
  display: none;
  @media (max-width: 500px) {
    display: flex;
  }
}

.show-smaller-than-sm-block {
  display: none;
  @media (max-width: 500px) {
    display: block;
  }
}

.show-between-sm-md {
  display: none;
  @media (min-width: 501px) and (max-width: 768px) {
    display: flex;
  }
}
</style>
