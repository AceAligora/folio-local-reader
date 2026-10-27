import {observeCover,resetCovers} from './covers.js';
import {selectFeaturedBooks} from './discovery-model.js';

const formats=[['pdf','PDF books'],['epub','EPUB books'],['images','Image books'],['cbz','Comics']];
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const title=book=>book.state.metadata?.title||book.title;
async function request(route){const response=await fetch('/api/'+route),data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
function action(text,fn,cls){const button=el('button',text,cls);button.type='button';button.onclick=()=>void Promise.resolve(fn()).catch(error=>{document.getElementById('message').textContent=error.message;});return button;}
function cover(book,cls){const stage=el('span',undefined,cls);if(book?.available){stage.append(el('span',title(book),'cover-fallback'));observeCover(stage,book);}else{const icon=el('img');icon.src='/icons/book-fill.svg';icon.alt='';icon.className='empty-cover-icon';stage.append(icon);}return stage;}
function sectionHeading(name,buttonText,fn){const row=el('div',undefined,'discovery-section-heading');row.append(el('h2',name));if(buttonText){const button=action(buttonText,fn,'quiet-button'),arrow=el('img');arrow.src='/icons/chevron-right.svg';arrow.alt='';button.append(arrow);row.append(button);}return row;}
function categoryCard(name,count,book,onOpen){const button=action('',onOpen,'category-tile');button.append(cover(book,'category-cover'),el('strong',name),el('span',count+' '+(count===1?'book':'books'),'category-count'));button.setAttribute('aria-label',name+', '+count+' '+(count===1?'book':'books'));return button;}
async function libraryGroups(){return Promise.all(formats.map(async([format,name])=>({format,name,...await request('books?format='+format)})));}

export async function mountDiscovery(host,{preferences,openBook,openCatalog,openCategories,addBooks,isCurrent=()=>true}){
  host.setAttribute('aria-busy','true');const [recent,reading,groups]=await Promise.all([request('books?sort=added&descending=true'),request('books?shelf=continue&sort=lastRead'),libraryGroups()]);
  if(!isCurrent())return;resetCovers(host);host.replaceChildren();host.removeAttribute('aria-busy');
  const search=el('form',undefined,'discovery-search');search.setAttribute('role','search');
  const category=el('select');category.setAttribute('aria-label','Search category');category.add(new Option('All categories',''));for(const name of preferences.categories)category.add(new Option(name,name));
  const label=el('label',undefined,'discovery-query'),icon=el('img'),input=el('input');icon.src='/icons/search.svg';icon.alt='';input.type='search';input.placeholder='Find the book you like…';input.setAttribute('aria-label','Find a book');label.append(icon,input);
  const submit=el('button','Search','primary');submit.type='submit';search.append(category,label,submit);search.onsubmit=event=>{event.preventDefault();void openCatalog({query:input.value,category:category.value}).catch(error=>{document.getElementById('message').textContent=error.message;});};host.append(search);
  const featured=el('section',undefined,'featured-section'),{ongoing,books}=selectFeaturedBooks(recent.books,reading.books);
  featured.append(sectionHeading(ongoing?'Continue reading':'Book recommendations','View all',()=>openCatalog(ongoing?{shelf:'continue',sort:'lastRead'}:{})));
  const grid=el('div',undefined,'featured-grid');
  for(const book of books){const button=action('',()=>openBook(book),'featured-book');button.append(cover(book,'featured-cover'));button.title=title(book);button.setAttribute('aria-label',(book.state.updated?'Continue reading ':'Read ')+title(book));grid.append(button);}
  if(!books.length){const empty=el('div',undefined,'discovery-empty');empty.append(el('h3','A place for your next chapter'),el('p','Add your ebook folder or import a few books to start your personal library.'),action('Add books',addBooks,'primary'));grid.append(empty);}
  featured.append(grid);host.append(featured);
  const categories=el('section',undefined,'discovery-categories');const categoryHeading=sectionHeading('Book categories'),manage=action('',openCategories,'category-manage'),manageIcon=el('img');manageIcon.src='/icons/sliders.svg';manageIcon.alt='';manage.setAttribute('aria-label','Browse categories');manage.append(manageIcon);categoryHeading.append(manage);categories.append(categoryHeading);const cards=el('div',undefined,'category-grid');
  for(const group of groups.filter(group=>group.total>0).slice(0,4))cards.append(categoryCard(group.name,group.total,group.books.find(book=>book.available),()=>openCatalog({format:group.format})));
  if(cards.children.length<4&&recent.total)cards.append(categoryCard('All books',recent.total,recent.books.find(book=>book.available),()=>openCatalog({})));
  if(!cards.children.length)cards.append(el('p','Your book categories will appear here as you add books.','muted'));
  categories.append(cards);host.append(categories);
}

export async function mountCategories(host,{preferences,openCatalog,manageCategories,addCollection,isCurrent=()=>true}){
  host.setAttribute('aria-busy','true');const [all,groups,collections]=await Promise.all([request('books'),libraryGroups(),request('collections')]);
  if(!isCurrent())return;resetCovers(host);host.replaceChildren();host.removeAttribute('aria-busy');
  const kinds=el('section',undefined,'category-section');kinds.append(sectionHeading('Browse by format'));const kindsGrid=el('div',undefined,'category-grid');for(const group of groups)kindsGrid.append(categoryCard(group.name,group.total,group.books.find(book=>book.available),()=>openCatalog({format:group.format})));kinds.append(kindsGrid);host.append(kinds);
  const categories=el('section',undefined,'category-section');categories.append(sectionHeading('Your categories','Manage',manageCategories));const categoryGrid=el('div',undefined,'category-grid');
  for(const name of preferences.categories){const books=all.books.filter(book=>(book.state.category||'Default')===name);categoryGrid.append(categoryCard(name,all.categoryCounts[name]||0,books.find(book=>book.available),()=>openCatalog({category:name})));}categories.append(categoryGrid);host.append(categories);
  const collectionSection=el('section',undefined,'category-section');collectionSection.append(sectionHeading('Your collections','New collection',addCollection));const collectionGrid=el('div',undefined,'category-grid');
  for(const collection of collections){const button=categoryCard(collection.name,collection.books.length,all.books.find(book=>book.available&&collection.books.includes(book.id)),()=>openCatalog({collection:collection.id}));collectionGrid.append(button);}
  if(!collections.length)collectionGrid.append(el('p','Group your books into collections without moving their files.','muted'));collectionSection.append(collectionGrid);host.append(collectionSection);
}
